import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

/** The renderer origin: a privileged standard scheme with one fixed host. */
export const APP_SCHEME = 'app';
const APP_HOST = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Privileges for `protocol.registerSchemesAsPrivileged`, which must run before app ready. */
export const APP_SCHEME_PRIVILEGES = {
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
} as const;

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

export type AppRequestResolution =
  | { readonly kind: 'file'; readonly path: string; readonly mimeType: string }
  | { readonly kind: 'refused'; readonly status: 400 | 403 | 404 | 405 };

const INDEX_FILE = 'index.html';

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

// A path that cannot be stat'ed, canonicalized or decoded is simply not servable: null.
const statOrNull = (path: string) => lstat(path).catch(() => null);
const realpathOrNull = (path: string) => realpath(path).catch(() => null);
const decodeOrNull = (path: string) =>
  Promise.resolve(path)
    .then(decodeURIComponent)
    .catch(() => null);

/**
 * Map an `app://app/...` request to a file under `root`. Refuses other hosts, encoded
 * separators, `..` segments, anything outside the root and symlinks; extensionless paths that
 * name no file are SPA routes and resolve to index.html.
 */
export async function resolveAppRequest(
  root: string,
  requestUrl: string,
  method = 'GET',
): Promise<AppRequestResolution> {
  if (method !== 'GET' && method !== 'HEAD') return { kind: 'refused', status: 405 };

  if (!URL.canParse(requestUrl)) return { kind: 'refused', status: 400 };
  const url = new URL(requestUrl);
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    return { kind: 'refused', status: 403 };
  }

  const pathname = await decodeOrNull(url.pathname);
  if (pathname === null) return { kind: 'refused', status: 400 };
  const segments = pathname.split('/').filter((segment) => segment !== '');
  if (
    pathname.includes('\0') ||
    pathname.includes('\\') ||
    /%2f|%5c/i.test(url.pathname) ||
    segments.some((segment) => segment === '..' || segment === '.')
  ) {
    return { kind: 'refused', status: 403 };
  }

  const realRoot = await realpath(root);
  const indexPath = resolve(realRoot, INDEX_FILE);
  const candidate = resolve(realRoot, ...segments);
  if (!isInside(realRoot, candidate)) return { kind: 'refused', status: 403 };

  const stats = segments.length === 0 ? null : await statOrNull(candidate);
  let target = candidate;
  if (stats === null || stats.isDirectory()) {
    if (segments.length > 0 && stats === null && extname(segments.at(-1) ?? '') !== '') {
      return { kind: 'refused', status: 404 };
    }
    target = indexPath;
  } else if (stats.isSymbolicLink()) {
    return { kind: 'refused', status: 403 };
  } else if (!stats.isFile()) {
    return { kind: 'refused', status: 404 };
  }

  // A symlinked parent directory leaves the final lstat clean; the canonical path must match.
  const canonical = await realpathOrNull(target);
  if (canonical === null) return { kind: 'refused', status: 404 };
  if (canonical !== target || !isInside(realRoot, canonical)) {
    return { kind: 'refused', status: 403 };
  }

  return {
    kind: 'file',
    path: canonical,
    mimeType: MIME_TYPES[extname(canonical).toLowerCase()] ?? 'application/octet-stream',
  };
}

// O_NOFOLLOW closes the swap-to-symlink race on the final component; Windows has no such flag.
const NO_FOLLOW: number = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

async function readNoFollowOrNull(path: string): Promise<Buffer | null> {
  const handle = await open(path, constants.O_RDONLY | NO_FOLLOW).catch(() => null);
  if (handle === null) return null;
  const body = await handle.readFile().catch(() => null);
  await handle.close();
  return body;
}

/** The `protocol.handle` callback: every response, refusals included, carries the CSP. */
export function createAppProtocolHandler(options: {
  readonly root: string;
  readonly contentSecurityPolicy: string;
}): (request: Request) => Promise<Response> {
  const baseHeaders = {
    'Content-Security-Policy': options.contentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  };

  return async (request) => {
    const resolution = await resolveAppRequest(options.root, request.url, request.method);
    if (resolution.kind === 'refused') {
      return new Response(null, { status: resolution.status, headers: baseHeaders });
    }
    const body = await readNoFollowOrNull(resolution.path);
    if (body === null) return new Response(null, { status: 404, headers: baseHeaders });
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Type': resolution.mimeType,
        'Content-Length': String(body.byteLength),
      },
    });
  };
}
