import { createHash, randomBytes } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { isPageStoreKey, MAX_PAGE_STORE_BYTES } from '@app/platform';
import { z } from 'zod';

// Main owns cached page bytes (spec 04 X5, X13). A page is two files under the store root,
// both named by the SHA-256 of its blob key: `<id>` holds the bytes and `<id>.json` the key
// and MIME type. The renderer only ever sees `page://store/<id>`; no path reaches a URL, and
// the key stays in the sidecar so cache maintenance can enumerate what is stored.

export const PAGE_SCHEME = 'page';
const PAGE_HOST = 'store';

/** Privileges for `protocol.registerSchemesAsPrivileged`, which must run before app ready. */
export const PAGE_SCHEME_PRIVILEGES = {
  scheme: PAGE_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
} as const;

/** Only image types are stored or served; anything else would let a page become a document. */
const PAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const PAGE_ID = /^[0-9a-f]{64}$/;
const SIDECAR_SUFFIX = '.json';
const TEMP_SUFFIX = '.tmp';

export function pageIdForKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function pageUrlForId(id: string): string {
  return `${PAGE_SCHEME}://${PAGE_HOST}/${id}`;
}

function sniffImageType(bytes: Uint8Array): string | undefined {
  const startsWith = (offset: number, ...values: number[]) =>
    values.every((value, index) => bytes[offset + index] === value);
  if (startsWith(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (startsWith(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (startsWith(0, 0x52, 0x49, 0x46, 0x46) && startsWith(8, 0x57, 0x45, 0x42, 0x50)) {
    return 'image/webp';
  }
  if (startsWith(4, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66)) return 'image/avif';
  return undefined;
}

/**
 * The declared type when it is an allowed image type, else the type the bytes carry. A
 * provider that labels a JPEG `application/octet-stream` still caches; a non-image never does.
 */
export function pageMimeType(declared: string, bytes: Uint8Array): string | undefined {
  const normalized = declared.split(';')[0]!.trim().toLowerCase();
  return PAGE_MIME_TYPES.has(normalized) ? normalized : sniffImageType(bytes);
}

const pageSidecarSchema = z
  .object({
    key: z.string().refine(isPageStoreKey),
    mimeType: z.string().refine((value) => PAGE_MIME_TYPES.has(value)),
  })
  .strict();

type PageSidecar = z.output<typeof pageSidecarSchema>;

// A sidecar that is unreadable, not JSON or not this shape names no page.
const parseSidecar = (text: string): Promise<PageSidecar | undefined> =>
  Promise.resolve(text)
    .then((value) => pageSidecarSchema.safeParse(JSON.parse(value)).data)
    .catch(() => undefined);

/** A listing can name thousands of files; this many are open at once. */
const LIST_CONCURRENCY = 32;

async function mapBounded<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += LIST_CONCURRENCY) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- batching IS the bound: one bounded round per chunk
    // oxlint-disable-next-line eslint/no-await-in-loop
    results.push(...(await Promise.all(items.slice(offset, offset + LIST_CONCURRENCY).map(run))));
  }
  return results;
}

// O_NOFOLLOW refuses a final-component symlink at open; Windows has no such flag.
const NO_FOLLOW: number = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

export type PageStoreResolution =
  | { readonly kind: 'file'; readonly path: string; readonly mimeType: string }
  | { readonly kind: 'refused'; readonly status: 400 | 403 | 404 | 405 };

export interface PageStore {
  /** Writes the page, replacing any earlier copy, and returns its `page://` URL. */
  put(key: string, bytes: Uint8Array, declaredMimeType: string): Promise<string>;
  /** The page's URL when both its bytes and sidecar are stored, else undefined. */
  urlFor(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  /** Keys with a committed sidecar. Removes leftovers of interrupted writes on the way. */
  listKeys(): Promise<string[]>;
  /** Maps a `page://` request to a stored file, refusing anything else. */
  resolve(requestUrl: string, method?: string): Promise<PageStoreResolution>;
}

export function createPageStore(root: string): PageStore {
  // Ids between their first write and their sidecar rename: a listing must not reap them.
  const writing = new Map<string, number>();
  let ready: Promise<string> | undefined;
  const realRoot = () => {
    ready ??= mkdir(root, { recursive: true }).then(() => realpath(root));
    return ready;
  };

  const readSidecar = async (dir: string, id: string) => {
    const text = await readFile(join(dir, `${id}${SIDECAR_SUFFIX}`), {
      encoding: 'utf8',
      flag: constants.O_RDONLY | NO_FOLLOW,
    }).catch(() => undefined);
    return text === undefined ? undefined : await parseSidecar(text);
  };

  /** A regular file, not a symlink, whose canonical path is directly under the root. */
  const isStoredFile = async (dir: string, name: string) => {
    const path = join(dir, name);
    const stats = await lstat(path).catch(() => null);
    if (stats === null || !stats.isFile()) return false;
    return (await realpath(path).catch(() => null)) === path;
  };

  const writeAtomic = async (path: string, data: Uint8Array | string) => {
    const temp = `${path}.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`;
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  };

  return {
    async put(key, bytes, declaredMimeType) {
      if (!isPageStoreKey(key)) throw new Error('Not a page store key.');
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PAGE_STORE_BYTES) {
        throw new Error('Page size is out of bounds.');
      }
      const mimeType = pageMimeType(declaredMimeType, bytes);
      if (mimeType === undefined) throw new Error('Page is not a supported image type.');
      const dir = await realRoot();
      const id = pageIdForKey(key);
      writing.set(id, (writing.get(id) ?? 0) + 1);
      try {
        // Bytes before sidecar: a sidecar always points at complete bytes.
        await writeAtomic(join(dir, id), bytes);
        await writeAtomic(
          join(dir, `${id}${SIDECAR_SUFFIX}`),
          JSON.stringify({ key, mimeType } satisfies PageSidecar),
        );
      } finally {
        const remaining = (writing.get(id) ?? 1) - 1;
        if (remaining <= 0) writing.delete(id);
        else writing.set(id, remaining);
      }
      return pageUrlForId(id);
    },

    async urlFor(key) {
      if (!isPageStoreKey(key)) return undefined;
      const dir = await realRoot();
      const id = pageIdForKey(key);
      const sidecar = await readSidecar(dir, id);
      if (sidecar?.key !== key || !(await isStoredFile(dir, id))) return undefined;
      return pageUrlForId(id);
    },

    async delete(key) {
      if (!isPageStoreKey(key)) throw new Error('Not a page store key.');
      const dir = await realRoot();
      const id = pageIdForKey(key);
      // Sidecar first: once it is gone the page is no longer listed or served.
      await rm(join(dir, `${id}${SIDECAR_SUFFIX}`), { force: true });
      await rm(join(dir, id), { force: true });
    },

    async listKeys() {
      const dir = await realRoot();
      const names = new Set(await readdir(dir));
      const keys: string[] = [];
      const leftovers: string[] = [];
      const sidecarIds: string[] = [];
      for (const name of names) {
        const id = name.split('.')[0]!;
        // Only the store's own names are touched; anything else in the directory is left be.
        if (!PAGE_ID.test(id) || writing.has(id)) continue;
        if (name.endsWith(TEMP_SUFFIX)) {
          // An interrupted write: nothing in flight owns it.
          leftovers.push(name);
        } else if (name === id && !names.has(`${id}${SIDECAR_SUFFIX}`)) {
          // Bytes whose sidecar never landed, or was deleted first, are unreachable.
          leftovers.push(name);
        } else if (name === `${id}${SIDECAR_SUFFIX}`) {
          sidecarIds.push(id);
        }
      }
      await mapBounded(leftovers, (name) => rm(join(dir, name), { force: true }));
      const sidecars = await mapBounded(sidecarIds, (id) => readSidecar(dir, id));
      for (const [index, sidecar] of sidecars.entries()) {
        if (sidecar !== undefined && pageIdForKey(sidecar.key) === sidecarIds[index]) {
          keys.push(sidecar.key);
        }
      }
      return keys;
    },

    async resolve(requestUrl, method = 'GET') {
      if (method !== 'GET' && method !== 'HEAD') return { kind: 'refused', status: 405 };
      if (!URL.canParse(requestUrl)) return { kind: 'refused', status: 400 };
      const url = new URL(requestUrl);
      if (url.protocol !== `${PAGE_SCHEME}:` || url.host !== PAGE_HOST) {
        return { kind: 'refused', status: 403 };
      }
      if (url.search !== '' || url.hash !== '') return { kind: 'refused', status: 400 };
      // The id is the whole path: one segment of 64 lowercase hex characters. Anything
      // else, encoded separators, dot segments and NUL included, is not an id.
      const id = url.pathname.slice(1);
      if (!PAGE_ID.test(id)) return { kind: 'refused', status: 403 };

      const dir = await realRoot();
      const sidecar = await readSidecar(dir, id);
      if (sidecar === undefined || pageIdForKey(sidecar.key) !== id) {
        return { kind: 'refused', status: 404 };
      }
      const path = join(dir, id);
      const stats = await lstat(path).catch(() => null);
      if (stats === null) return { kind: 'refused', status: 404 };
      if (stats.isSymbolicLink()) return { kind: 'refused', status: 403 };
      if (!stats.isFile()) return { kind: 'refused', status: 404 };
      // A symlinked store directory leaves the lstat clean; the canonical path must match.
      if ((await realpath(path).catch(() => null)) !== path) {
        return { kind: 'refused', status: 403 };
      }
      return { kind: 'file', path, mimeType: sidecar.mimeType };
    },
  };
}

/**
 * The `protocol.handle` callback. A request is served only when the app's own origin issued
 * it: `initiatorOrigin` is set by the browser, not the page, and is absent for requests no
 * frame made. Every response carries the CSP and nosniff; bodies stream from disk.
 */
export function createPageProtocolHandler(options: {
  readonly store: PageStore;
  readonly allowedOrigins: readonly string[];
  readonly contentSecurityPolicy: string;
}): (request: Request) => Promise<Response> {
  const baseHeaders = {
    'Content-Security-Policy': options.contentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
  const refuse = (status: number) => new Response(null, { status, headers: baseHeaders });

  return async (request) => {
    const initiator = (request as Request & { readonly initiatorOrigin?: string }).initiatorOrigin;
    if (initiator === undefined || !options.allowedOrigins.includes(initiator)) {
      return refuse(403);
    }
    const resolution = await options.store.resolve(request.url, request.method);
    if (resolution.kind === 'refused') return refuse(resolution.status);

    const handle = await open(resolution.path, constants.O_RDONLY | NO_FOLLOW).catch(() => null);
    if (handle === null) return refuse(404);
    const stats = await handle.stat().catch(() => null);
    if (stats === null || !stats.isFile()) {
      await handle.close();
      return refuse(404);
    }
    const headers = {
      ...baseHeaders,
      'Content-Type': resolution.mimeType,
      'Content-Length': String(stats.size),
    };
    if (request.method === 'HEAD') {
      await handle.close();
      return new Response(null, { status: 200, headers });
    }
    // The stream owns the handle and closes it when done or cancelled.
    const body = Readable.toWeb(createReadStream('', { fd: handle })) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 200, headers });
  };
}
