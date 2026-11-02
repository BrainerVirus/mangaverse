import { session } from 'electron';

function devServerOrigin(): string {
  const url =
    process.env.VITE_DEV_SERVER_URL ??
    process.env.MANGAVERSE_RENDERER_URL ??
    'http://localhost:5173';
  return url.replace(/\/$/, '');
}

const MANGADEX_CONNECT_SRC = 'https://api.mangadex.org https://uploads.mangadex.org';

export function buildContentSecurityPolicy(isDev: boolean): string {
  if (isDev) {
    const origin = devServerOrigin();
    const wsOrigin = origin.replace(/^http/, 'ws');
    return [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${origin}`,
      `style-src 'self' 'unsafe-inline' ${origin}`,
      "img-src 'self' data: blob: https: page:",
      `connect-src 'self' ${origin} ${wsOrigin} ws: wss: ${MANGADEX_CONNECT_SRC}`,
      "font-src 'self' data:",
      "worker-src 'self' blob:",
    ].join('; ');
  }

  // Production serves the static shell from app://app (`'self'`): no loopback origin, no inline
  // or eval'd script.
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: page:",
    `connect-src 'self' ${MANGADEX_CONNECT_SRC}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Sent with every page:// response. A page is an image for an <img>; opened any other way it
 * may run, load and embed nothing.
 */
export const PAGE_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src 'self'; sandbox";

/** Dev only: the Vite server sends no CSP, so add the HMR-friendly policy to its responses. */
export function registerDevContentSecurityPolicy(): void {
  const csp = buildContentSecurityPolicy(true);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
