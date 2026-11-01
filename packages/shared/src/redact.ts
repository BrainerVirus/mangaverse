/** Redaction for anything written to an on-device log. */

const SAFE_DETAIL_KEYS = new Set([
  'operation',
  'endpoint',
  'status',
  'mangaId',
  'chapterId',
  'version',
  'count',
  'checks',
]);

const UNSAFE_DETAIL_KEY = /token|secret|auth|password|credential|key|url|uri|query|cookie|session/i;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Removes credentials, cookies, query strings and authorization values from anything persisted. */
export function sanitizeLogMessage(message: string): string {
  return truncate(
    message
      // Quoted JSON credential fields: "authorization":"Basic …", "cookie":"session=…".
      .replace(
        /(["'])((?:proxy-)?authorization|cookie|set-cookie)\1\s*:\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[[^\]\n\r]*\]|\{[^}\n\r]*\}|[^,}\n\r]+)/gi,
        '"$2":"[redacted]"',
      )
      // Authorization and cookie header values may contain a scheme, spaces or
      // several pairs; redact the line remainder once the header name is known.
      .replace(
        /\b((?:proxy-)?authorization|set-cookie|cookie)\s*:\s*(?:"[^"]*"|'[^']*'|[^\n\r]+)/gi,
        '$1: [redacted]',
      )
      // Bare, quoted-JSON and header-style credential pairs: token=…, "token":"…", X-Api-Key: …
      .replace(
        /\b(key|(?:access|refresh)[_-]?token|apikey|api[_-]?key|token|secret|password|cookie|set-cookie|x-api-key|x-auth-token)(\s*["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
        '$1$2[redacted]',
      )
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
      .replace(/https?:\/\/[^\s]+/gi, (raw) => {
        try {
          const url = new URL(raw);
          return `${url.origin}${url.pathname}`;
        } catch {
          return '[url]';
        }
      }),
    300,
  );
}

export function sanitizeLogDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (details === undefined) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_DETAIL_KEYS.has(key) || UNSAFE_DETAIL_KEY.test(key)) continue;
    if (typeof value === 'string') {
      safe[key] = truncate(sanitizeLogMessage(value), 160);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}
