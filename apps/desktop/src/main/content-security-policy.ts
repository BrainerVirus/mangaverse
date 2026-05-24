import { session } from 'electron';

function devServerOrigin(): string {
  const url = process.env.VITE_DEV_SERVER_URL ?? process.env.MANGAVERSE_RENDERER_URL ?? 'http://localhost:5173';
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
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${origin} ${wsOrigin} ws: wss: https://api.mangadex.org`,
      "font-src 'self' data:",
      "worker-src 'self' blob:",
    ].join('; ');
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://api.mangadex.org",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
  ].join('; ');
}

/** Apply CSP via response headers. Dev policy allows Vite HMR (eval + websocket). */
export function registerContentSecurityPolicy(isDev: boolean): void {
  const csp = buildContentSecurityPolicy(isDev);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
