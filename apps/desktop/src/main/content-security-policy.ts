import { session } from 'electron';

function devServerOrigin(): string {
  const url =
    process.env.VITE_DEV_SERVER_URL ??
    process.env.MANGAVERSE_RENDERER_URL ??
    'http://localhost:5173';
  return url.replace(/\/$/, '');
}

export function buildContentSecurityPolicy(isDev: boolean): string {
  if (isDev) {
    const origin = devServerOrigin();
    const wsOrigin = origin.replace(/^http/, 'ws');
    return [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${origin}`,
      `style-src 'self' 'unsafe-inline' ${origin}`,
      "img-src 'self' data: blob: https: page:",
      // Only the dev server; provider traffic goes through main, never the renderer.
      `connect-src 'self' ${origin} ${wsOrigin}`,
      "font-src 'self' data:",
      "worker-src 'self' blob:",
    ].join('; ');
  }

  // Production serves the static shell from app://app (`'self'`): no loopback origin, no inline
  // or eval'd script. Provider calls and every remote image byte come from main, so neither
  // `connect-src` nor `img-src` names a provider origin.
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: page:",
    "connect-src 'self'",
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
