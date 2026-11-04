import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPageProtocolHandler,
  createPageStore,
  pageIdForKey,
  pageMimeType,
  pageUrlForId,
  type PageStore,
} from './page-store.js';

interface Gate {
  /** Resolves once the gated call has been reached. */
  hit: Promise<void>;
  reached: () => void;
  /** The gated call waits on this until `release`. */
  wait: Promise<void>;
  release: () => void;
}

function createGate(): Gate {
  let reached!: () => void;
  let release!: () => void;
  const hit = new Promise<void>((resolve) => (reached = resolve));
  const wait = new Promise<void>((resolve) => (release = resolve));
  return { hit, reached, wait, release };
}

// One-shot gates: a gate parks the next matching call, then clears itself, so every other
// fs call passes straight through to the real module.
const gates = vi.hoisted(() => ({
  readdir: undefined as undefined | Gate,
  sidecarRename: undefined as undefined | Gate,
  bytesRename: undefined as undefined | Gate,
  sidecarLstat: undefined as undefined | Gate,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    // Parks after the listing is taken, so the snapshot is stale when the call resumes.
    readdir: async (path: string) => {
      const result = await actual.readdir(path);
      const gate = gates.readdir;
      if (gate !== undefined) {
        gates.readdir = undefined;
        gate.reached();
        await gate.wait;
      }
      return result;
    },
    // Parks after the lookup has answered, so the caller acts on an answer that may go stale.
    lstat: (path: string) =>
      actual.lstat(path).finally(async () => {
        const gate = gates.sidecarLstat;
        if (gate !== undefined && path.endsWith('.json')) {
          gates.sidecarLstat = undefined;
          gate.reached();
          await gate.wait;
        }
      }),
    rename: async (from: string, to: string) => {
      const gate = gates.sidecarRename;
      if (gate !== undefined && to.endsWith('.json')) {
        gates.sidecarRename = undefined;
        gate.reached();
        await gate.wait;
      }
      const bytesGate = gates.bytesRename;
      if (bytesGate !== undefined && !to.endsWith('.json')) {
        gates.bytesRename = undefined;
        bytesGate.reached();
        await bytesGate.wait;
      }
      return actual.rename(from, to);
    },
  };
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KEY = 'page:mangadex:manga-1:chapter-1:0';
const APP = 'app://app';
const CSP = "default-src 'none'; img-src 'self'; sandbox";

let base: string;
let root: string;
let store: PageStore;

beforeEach(async () => {
  base = realpathSync(await mkdtemp(join(tmpdir(), 'page-store-')));
  root = join(base, 'pages');
  store = createPageStore(root);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** A request as Electron hands it to `protocol.handle`, with the browser-set initiator. */
function pageRequest(url: string, init: { method?: string; initiatorOrigin?: string } = {}) {
  const request = new Request(url, { method: init.method ?? 'GET' });
  if (init.initiatorOrigin !== undefined) {
    Object.defineProperty(request, 'initiatorOrigin', { value: init.initiatorOrigin });
  }
  return request;
}

const handler = () =>
  createPageProtocolHandler({ store, allowedOrigins: [APP], contentSecurityPolicy: CSP });

describe('page store', () => {
  it('stores bytes as a file named by an opaque id, with the key, MIME and digest in a sidecar', async () => {
    const url = await store.put(KEY, JPEG, 'image/jpeg');
    const id = pageIdForKey(KEY);

    expect(url).toBe(`page://store/${id}`);
    expect(url).not.toContain(root);
    expect(url).not.toContain('mangadex');
    expect(new Uint8Array(await readFile(join(root, id)))).toEqual(JPEG);
    expect(JSON.parse(await readFile(join(root, `${id}.json`), 'utf8'))).toEqual({
      key: KEY,
      mimeType: 'image/jpeg',
      sha256: createHash('sha256').update(JPEG).digest('hex'),
    });
    expect(await store.urlFor(KEY)).toBe(url);
    expect(await store.listKeys()).toEqual([KEY]);
  });

  it('reports the stored digest and size, and nothing once the bytes are gone', async () => {
    await store.put(KEY, JPEG, 'image/jpeg');
    const verified = await store.verify(KEY);
    expect(verified?.byteSize).toBe(JPEG.byteLength);
    expect(verified?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.verify('page:not-stored')).toBeUndefined();
    await rm(join(root, pageIdForKey(KEY)));
    expect(await store.verify(KEY)).toBeUndefined();
  });

  it('verifies nothing when the bytes no longer match the digest their sidecar recorded', async () => {
    await store.put(KEY, JPEG, 'image/jpeg');
    await writeFile(join(root, pageIdForKey(KEY)), PNG);

    expect(await store.verify(KEY)).toBeUndefined();
  });

  it('still verifies a sidecar written before the digest was recorded', async () => {
    await store.put(KEY, JPEG, 'image/jpeg');
    await writeFile(
      join(root, `${pageIdForKey(KEY)}.json`),
      JSON.stringify({ key: KEY, mimeType: 'image/jpeg' }),
    );

    expect((await store.verify(KEY))?.byteSize).toBe(JPEG.byteLength);
  });

  it('keeps listing a sidecar whose bytes were lost, so an importer can see and verify it', async () => {
    await store.put(KEY, JPEG, 'image/jpeg');
    await rm(join(root, pageIdForKey(KEY)));

    expect(await store.listKeys()).toEqual([KEY]);
    expect(await store.verify(KEY)).toBeUndefined();
  });

  it('removes the file and its sidecar together on delete', async () => {
    await store.put(KEY, JPEG, 'image/jpeg');
    await store.delete(KEY);

    expect(await readdir(root)).toEqual([]);
    expect(await store.urlFor(KEY)).toBeUndefined();
    expect(await store.listKeys()).toEqual([]);
  });

  it('reports no URL when the bytes are missing', async () => {
    await store.put(KEY, JPEG, 'image/jpeg');
    await rm(join(root, pageIdForKey(KEY)));
    expect(await store.urlFor(KEY)).toBeUndefined();
  });

  it('sweeps interrupted writes and sidecar-less bytes when listing', async () => {
    const id = pageIdForKey(KEY);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, id), JPEG);
    await writeFile(join(root, `${pageIdForKey('page:x')}.abc.tmp`), JPEG);
    await writeFile(join(root, 'unrelated.txt'), 'not ours');

    expect(await store.listKeys()).toEqual([]);
    expect(await readdir(root)).toEqual(['unrelated.txt']);
  });

  it('keeps the bytes of a put whose sidecar landed after the listing was taken', async () => {
    await store.put('page:warm:m:c:9', JPEG, 'image/jpeg'); // creates the directory
    const putGate = createGate();
    const listGate = createGate();

    gates.sidecarRename = putGate;
    const put = store.put(KEY, JPEG, 'image/jpeg');
    await putGate.hit; // bytes are on disk, the sidecar is not
    gates.readdir = listGate;
    const sweep = store.listKeys();
    await listGate.hit; // the snapshot has bytes without a sidecar
    putGate.release();
    await put; // the sidecar lands and the put is no longer in flight
    listGate.release();
    await sweep;

    expect(await store.urlFor(KEY)).toBe(pageUrlForId(pageIdForKey(KEY)));
    expect(await store.verify(KEY)).toEqual({
      sha256: createHash('sha256').update(JPEG).digest('hex'),
      byteSize: JPEG.byteLength,
    });
    expect(await store.listKeys()).toContain(KEY);
  });

  it('still reaps bytes whose sidecar never lands, even when the listing was stale', async () => {
    const id = pageIdForKey(KEY);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, id), JPEG);
    const listGate = createGate();

    gates.readdir = listGate;
    const sweep = store.listKeys();
    await listGate.hit;
    listGate.release();

    expect(await sweep).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it('keeps the bytes of a put that runs between the sweep checking the sidecar and deleting', async () => {
    const id = pageIdForKey(KEY);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, id), PNG); // bytes with no sidecar: a leftover
    const lstatGate = createGate();

    gates.sidecarLstat = lstatGate;
    const sweep = store.listKeys();
    await lstatGate.hit; // the sweep saw no sidecar and has not deleted yet
    const put = store.put(KEY, JPEG, 'image/jpeg');
    // Unserialized, the put finishes here; serialized, it queues behind the sweep. Either
    // way the sweep resumes only once the put has had its chance to run.
    await Promise.race([put, new Promise((resolve) => setTimeout(resolve, 100))]);
    lstatGate.release();
    await Promise.all([sweep, put]);

    expect(await store.urlFor(KEY)).toBe(pageUrlForId(id));
    expect(await store.verify(KEY)).toEqual({
      sha256: createHash('sha256').update(JPEG).digest('hex'),
      byteSize: JPEG.byteLength,
    });
  });

  it('reaps a torn sidecar with its bytes, and a later put of the same key works', async () => {
    const id = pageIdForKey(KEY);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, id), JPEG);
    await writeFile(join(root, `${id}.json`), '{"key":"page:mangad');

    expect(await store.listKeys()).toEqual([]);
    expect(await readdir(root)).toEqual([]);

    const url = await store.put(KEY, PNG, 'image/png');
    expect(await store.urlFor(KEY)).toBe(url);
    expect(await store.listKeys()).toEqual([KEY]);
  });

  it('reaps a sidecar whose key hashes to another id, with its bytes', async () => {
    const id = pageIdForKey(KEY);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, id), JPEG);
    await writeFile(
      join(root, `${id}.json`),
      JSON.stringify({ key: 'page:p:m:c:1', mimeType: 'image/jpeg' }),
    );
    await writeFile(join(root, 'unrelated.txt'), 'not ours');

    expect(await store.listKeys()).toEqual([]);
    expect(await readdir(root)).toEqual(['unrelated.txt']);
  });

  it('keeps a valid page beside the invalid ones it reaps', async () => {
    const otherKey = 'page:p:m:c:1';
    const id = pageIdForKey(KEY);
    await store.put(otherKey, PNG, 'image/png');
    await writeFile(join(root, id), JPEG);
    await writeFile(join(root, `${id}.json`), 'not json');

    expect(await store.listKeys()).toEqual([otherKey]);
    expect(await store.verify(otherKey)).toBeDefined();
    expect((await readdir(root)).sort()).toEqual(
      [pageIdForKey(otherKey), `${pageIdForKey(otherKey)}.json`].sort(),
    );
  });

  it('removes the old sidecar before new bytes land on a replace, so no stale sidecar serves them', async () => {
    const id = pageIdForKey(KEY);
    await store.put(KEY, JPEG, 'image/jpeg');
    const bytesGate = createGate();

    gates.bytesRename = bytesGate;
    const replace = store.put(KEY, PNG, 'image/png');
    await bytesGate.hit; // the new bytes are written but not renamed; a crash here stops this way

    expect(await readdir(root)).not.toContain(`${id}.json`);
    expect(await store.urlFor(KEY)).toBeUndefined();
    expect(await store.resolve(pageUrlForId(id))).toEqual({ kind: 'refused', status: 404 });

    bytesGate.release();
    await replace;
    expect(await store.verify(KEY)).toEqual({
      sha256: createHash('sha256').update(PNG).digest('hex'),
      byteSize: PNG.byteLength,
    });
    expect(await store.resolve(pageUrlForId(id))).toMatchObject({
      kind: 'file',
      mimeType: 'image/png',
    });
  });

  it('refuses keys that are not pages and bodies that are not images', async () => {
    const notPage = 'Not a page store key.';
    const notImage = 'Page is not a supported image type.';
    await expect(store.put('cover:p:m', JPEG, 'image/jpeg')).rejects.toThrow(notPage);
    const svg = new TextEncoder().encode('<svg/>');
    await expect(store.put(KEY, svg, 'image/svg+xml')).rejects.toThrow(notImage);
    const html = new TextEncoder().encode('<html>');
    await expect(store.put(KEY, html, 'text/html')).rejects.toThrow(notImage);
    await expect(store.put(KEY, new Uint8Array(), 'image/jpeg')).rejects.toThrow(
      'Page size is out of bounds.',
    );
    expect(await readdir(root).catch(() => [])).toEqual([]);
  });

  it('writes after a failed first use once the cause is fixed', async (context) => {
    await chmod(base, 0o555);
    try {
      // Root and some filesystems ignore the mode; there is no failure to recover from then.
      const denied = await store.put(KEY, JPEG, 'image/jpeg').then(
        () => false,
        () => true,
      );
      if (!denied) context.skip();
    } finally {
      await chmod(base, 0o755);
    }

    const url = await store.put(KEY, JPEG, 'image/jpeg');
    expect(await store.urlFor(KEY)).toBe(url);
  });

  it('recreates a store root that was removed while running', async () => {
    const otherKey = 'page:p:m:c:1';
    await store.put(KEY, JPEG, 'image/jpeg');
    await rm(root, { recursive: true });

    const url = await store.put(otherKey, PNG, 'image/png');

    expect(await store.urlFor(otherKey)).toBe(url);
    expect(await store.urlFor(KEY)).toBeUndefined();
    expect(await store.listKeys()).toEqual([otherKey]);
  });

  it('reads a removed store root as empty and lists it again once recreated', async () => {
    await store.put(KEY, JPEG, 'image/jpeg');
    await rm(root, { recursive: true });

    expect(await store.urlFor(KEY)).toBeUndefined();
    expect(await store.resolve(pageUrlForId(pageIdForKey(KEY)))).toEqual({
      kind: 'refused',
      status: 404,
    });
    expect(await store.listKeys()).toEqual([]);
    await store.put(KEY, JPEG, 'image/jpeg');
    expect(await store.listKeys()).toEqual([KEY]);
  });
});

describe('pageMimeType', () => {
  it('keeps an allowed declared type and sniffs a mislabeled image', () => {
    expect(pageMimeType('image/webp; charset=binary', JPEG)).toBe('image/webp');
    expect(pageMimeType('application/octet-stream', JPEG)).toBe('image/jpeg');
    expect(pageMimeType('', PNG)).toBe('image/png');
    expect(pageMimeType('text/html', new TextEncoder().encode('<script>'))).toBeUndefined();
  });
});

describe('page protocol', () => {
  it('streams a stored page with its MIME type, CSP and nosniff', async () => {
    const url = await store.put(KEY, JPEG, 'application/octet-stream');
    const response = await handler()(pageRequest(url, { initiatorOrigin: APP }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Content-Length')).toBe(String(JPEG.byteLength));
    expect(response.headers.get('Content-Security-Policy')).toBe(CSP);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.body).toBeInstanceOf(ReadableStream);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it('answers HEAD with headers and no body', async () => {
    const url = await store.put(KEY, PNG, 'image/png');
    const response = await handler()(pageRequest(url, { method: 'HEAD', initiatorOrigin: APP }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.body).toBeNull();
  });

  describe('refusals', () => {
    let id: string;
    beforeEach(async () => {
      await store.put(KEY, JPEG, 'image/jpeg');
      id = pageIdForKey(KEY);
      await writeFile(join(base, 'secret.txt'), 'outside the store');
    });

    const refusedStatus = async (
      url: string,
      init?: { method?: string; initiatorOrigin?: string },
    ) => {
      const response = await handler()(pageRequest(url, { initiatorOrigin: APP, ...init }));
      expect(response.headers.get('Content-Security-Policy')).toBe(CSP);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      return response.status;
    };

    it('refuses traversal and dot segments', async () => {
      for (const url of [
        'page://store/../secret.txt',
        'page://store/%2e%2e/secret.txt',
        `page://store/${id}/..`,
        'page://store/./',
      ]) {
        expect(await refusedStatus(url)).toBe(403);
      }
    });

    it('refuses encoded separators', async () => {
      for (const url of [
        `page://store/..%2fsecret.txt`,
        `page://store/..%5csecret.txt`,
        `page://store/${id}%2f`,
        `page://store/%2F${id}`,
      ]) {
        expect(await refusedStatus(url)).toBe(403);
      }
    });

    it('refuses NUL', async () => {
      expect(await refusedStatus(`page://store/${id}%00`)).toBe(403);
      expect(await refusedStatus(`page://store/${id}%00.json`)).toBe(403);
    });

    it('refuses paths and anything outside the store', async () => {
      for (const url of [
        `page://store/${join(base, 'secret.txt')}`,
        `page://store/${id}.json`,
        `page://store/${root}/${id}`,
        `page://other/${id}`,
        `app://app/${id}`,
        `page://store/${id}?path=/etc/passwd`,
      ]) {
        expect([400, 403]).toContain(await refusedStatus(url));
      }
    });

    it('refuses a symlinked page file', async () => {
      const linkedKey = 'page:p:m:c:1';
      const linkedId = pageIdForKey(linkedKey);
      await store.put(linkedKey, JPEG, 'image/jpeg');
      await rm(join(root, linkedId));
      await symlink(join(base, 'secret.txt'), join(root, linkedId));
      expect(await refusedStatus(pageUrlForId(linkedId))).toBe(403);
    });

    it('refuses a symlinked sidecar that would vouch for an outside file', async () => {
      const forgedKey = 'page:p:m:c:2';
      const forgedId = pageIdForKey(forgedKey);
      await writeFile(join(root, forgedId), JPEG);
      await writeFile(
        join(base, 'forged.json'),
        JSON.stringify({ key: forgedKey, mimeType: 'image/jpeg' }),
      );
      await symlink(join(base, 'forged.json'), join(root, `${forgedId}.json`));
      expect(await refusedStatus(pageUrlForId(forgedId))).toBe(404);
      expect(await store.urlFor(forgedKey)).toBeUndefined();
    });

    it('refuses unknown ids', async () => {
      expect(await refusedStatus(pageUrlForId('0'.repeat(64)))).toBe(404);
      expect(await refusedStatus('page://store/not-an-id')).toBe(403);
      expect(await refusedStatus('page://store/')).toBe(403);
    });

    it('refuses requests from other frames and from no frame', async () => {
      const url = pageUrlForId(id);
      expect(await refusedStatus(url, { initiatorOrigin: 'https://evil.example' })).toBe(403);
      expect(await refusedStatus(url, { initiatorOrigin: 'null' })).toBe(403);
      expect(await refusedStatus(url, { initiatorOrigin: 'page://store' })).toBe(403);
      const response = await handler()(pageRequest(url));
      expect(response.status).toBe(403);
    });

    it('refuses methods other than GET and HEAD', async () => {
      for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
        expect(await refusedStatus(pageUrlForId(id), { method })).toBe(405);
      }
    });
  });
});
