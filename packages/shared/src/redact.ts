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

/** A key and its separator: token=, "token":, \"token\": or X-Api-Key: */
const KEY_VALUE_PAIR = /(?<![\w-])([\w-]+)(\\*["'])?[^\S\n\r]*[:=][^\S\n\r]*/g;
/** The marker left by an earlier pass; it must heal on re-redaction, not end the value. */
const REDACTED_PLACEHOLDER = '[redacted]';
const SENSITIVE_KEY =
  /token|secret|passw(?:or)?d|pwd|credential|cookie|session|authorization|(?:api|access|private)[_-]?key|(?:^|[_-])(?:key|auth)$/i;
/** Header values may contain a scheme, spaces or several pairs. */
const WHOLE_LINE_KEY = /authorization|cookie/i;
const QUOTE_AT = /(\\*)(["'])/y;
const BARE_VALUE_AT = /[^\s"'&,;}\]]*/y;
const LINE_REMAINDER_AT = /[^\n\r]*/y;
const FIELD_REMAINDER_AT = /[^,}\]\n\r]*/y;

function endOfMatch(pattern: RegExp, text: string, at: number): number {
  pattern.lastIndex = at;
  return pattern.exec(text) === null ? at : pattern.lastIndex;
}

/**
 * Index just past the string whose opening quote is at `quoteAt`. A string
 * nested in encoded JSON opens with `escapes` backslashes, and only closes on a
 * quote carrying that same encoding. An unclosed string runs to the end.
 */
function endOfQuoted(text: string, quoteAt: number, escapes: number): number {
  let backslashes = 0;
  for (let index = quoteAt + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      backslashes += 1;
      continue;
    }
    if (text[index] === text[quoteAt] && backslashes % (2 * (escapes + 1)) === escapes) {
      return index + 1;
    }
    backslashes = 0;
  }
  return text.length;
}

/** Index just past the balanced object or array at `start`; malformed input runs to the end. */
function endOfBalanced(text: string, start: number): number {
  const closers: string[] = [];
  let backslashes = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      backslashes += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      index = endOfQuoted(text, index, backslashes) - 1;
    } else if (char === '{') {
      closers.push('}');
    } else if (char === '[') {
      closers.push(']');
    } else if (char === '}' || char === ']') {
      if (closers.pop() !== char) return text.length;
      if (closers.length === 0) return index + 1;
    }
    backslashes = 0;
  }
  return text.length;
}

/** Redacts the complete value after every sensitive key, failing closed on malformed values. */
function redactCredentials(text: string): string {
  let redacted = '';
  let copiedTo = 0;
  for (const match of text.matchAll(KEY_VALUE_PAIR)) {
    const [pair, key = '', keyQuote = ''] = match;
    if (match.index < copiedTo || !SENSITIVE_KEY.test(key)) continue;

    const valueAt = match.index + pair.length;
    const wholeLine = keyQuote === '' && WHOLE_LINE_KEY.test(key);
    const quoteEnd = endOfMatch(QUOTE_AT, text, valueAt);
    const isQuoted = quoteEnd > valueAt;
    const isPlaceholder = text.startsWith(REDACTED_PLACEHOLDER, valueAt);
    // Only a JSON key can hold an object or array value; a bare key fails closed to the line.
    const isBalanced = keyQuote !== '' && (text[valueAt] === '{' || text[valueAt] === '[');

    let valueEnd: number;
    if (isQuoted) {
      valueEnd = endOfQuoted(text, quoteEnd - 1, quoteEnd - 1 - valueAt);
      // A single-quoted value cannot be distinguished from an early apostrophe
      // once any text follows the closing quote — and a real secret can continue
      // past a newline. Fail closed to the end of the text, not just the line.
      if (text[valueAt] === "'") {
        if (/\S/.test(text.slice(valueEnd))) valueEnd = text.length;
      } else if (endOfMatch(BARE_VALUE_AT, text, valueEnd) > valueEnd) {
        valueEnd = endOfMatch(LINE_REMAINDER_AT, text, valueAt);
      }
    } else if (isPlaceholder) {
      // An older row may still carry text after the marker; heal it instead of ending the value at `]`.
      valueEnd = endOfMatch(LINE_REMAINDER_AT, text, valueAt);
    } else if (isBalanced) {
      valueEnd = endOfBalanced(text, valueAt);
    } else if (keyQuote !== '') {
      valueEnd = endOfMatch(FIELD_REMAINDER_AT, text, valueAt);
    } else {
      // An unquoted value has no reliable terminator: fail closed to the end of its line.
      valueEnd = endOfMatch(LINE_REMAINDER_AT, text, valueAt);
    }
    if (valueEnd === valueAt) continue;
    // Text glued to a closed value is still part of it.
    valueEnd = endOfMatch(wholeLine ? LINE_REMAINDER_AT : BARE_VALUE_AT, text, valueEnd);

    const valueQuote = isQuoted ? text.slice(valueAt, quoteEnd) : keyQuote;
    const separator = keyQuote === '' ? pair.slice(key.length) : `${keyQuote}:`;
    redacted += `${text.slice(copiedTo, match.index)}${key}${separator}${valueQuote}[redacted]${valueQuote}`;
    copiedTo = valueEnd;
  }
  return redacted + text.slice(copiedTo);
}

/** Removes credentials, cookies, query strings and authorization values from anything persisted. */
export function sanitizeLogMessage(message: string): string {
  return truncate(
    redactCredentials(message)
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
      .replace(/https?:\/\/[^\s]+/gi, (raw) => {
        if (!URL.canParse(raw)) return '[url]';
        const url = new URL(raw);
        return `${url.origin}${url.pathname}`;
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
