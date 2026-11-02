import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPageProtocolHandler,
  createPageStore,
  pageIdForKey,
  pageMimeType,
  pageUrlForId,
  type PageStore,
} from './page-store.js';

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
  it('stores bytes as a file named by an opaque id, with the key and MIME in a sidecar', async () => {
    const url = await store.put(KEY, JPEG, 'image/jpeg');
    const id = pageIdForKey(KEY);

    expect(url).toBe(`page://store/${id}`);
    expect(url).not.toContain(root);
    expect(url).not.toContain('mangadex');
    expect(new Uint8Array(await readFile(join(root, id)))).toEqual(JPEG);
    expect(JSON.parse(await readFile(join(root, `${id}.json`), 'utf8'))).toEqual({
      key: KEY,
      mimeType: 'image/jpeg',
    });
    expect(await store.urlFor(KEY)).toBe(url);
    expect(await store.listKeys()).toEqual([KEY]);
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
