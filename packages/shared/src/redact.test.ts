import { describe, expect, it } from 'vitest';

import { sanitizeLogDetails, sanitizeLogMessage } from './redact.js';

describe('sanitizeLogMessage', () => {
  it('redacts an unquoted value to the end of its line, so a multiword credential cannot leak', () => {
    expect(
      sanitizeLogMessage(
        'GET https://x.test/a?token=s3cret&page=2 with Bearer abc.def password=hunter2',
      ),
    ).toBe('GET https://x.test/a');
  });

  it.each([
    ['a bearer token', 'Bearer abc.def failed', 'Bearer [redacted] failed'],
    ['a bare password', 'password=hunter2', 'password=[redacted]'],
    ['a URL query', 'GET https://x.test/a?token=s3cret&page=2', 'GET https://x.test/a'],
  ])('redacts %s', (_name, input, expected) => {
    expect(sanitizeLogMessage(input)).toBe(expected);
  });

  it.each([
    ['a multiword password', 'password=SECRET FIRST', 'password=[redacted]'],
    ['a multiword token', 'token=abc.def extra', 'token=[redacted]'],
    ['a punctuation-heavy password', 'password=abc,def tail', 'password=[redacted]'],
    ['a form body', 'user=x&password=SECRET FIRST&c=d', 'user=x&password=[redacted]'],
    ['a line boundary', 'password=SECRET\nnext line', 'password=[redacted]\nnext line'],
    ['an empty value', 'password=', 'password='],
    ['an empty value before a newline', 'password=\nnext line', 'password=\nnext line'],
  ])('redacts a bare value to the end of its line for %s', (_name, input, expected) => {
    expect(sanitizeLogMessage(input)).toBe(expected);
  });

  it.each([
    ['password', 'password=[redacted] FIRST', 'password=[redacted]'],
    ['token', 'token=[redacted] extra', 'token=[redacted]'],
  ])('heals a stored %s placeholder on re-redaction', (_name, input, expected) => {
    expect(sanitizeLogMessage(input)).toBe(expected);
  });

  it('fails closed on prose after a sensitive bare key', () => {
    expect(sanitizeLogMessage('invalid token: expired, please sign in')).toBe(
      'invalid token: [redacted]',
    );
    expect(sanitizeLogMessage('session: restored from backup')).toBe('session: [redacted]');
  });

  it('redacts an unquoted JSON field value up to its comma', () => {
    expect(sanitizeLogMessage('{"token":abc def,"page":2}')).toBe(
      '{"token":"[redacted]","page":2}',
    );
  });

  it('replaces an unparseable URL', () => {
    expect(sanitizeLogMessage('see https://[bad')).toBe('see [url]');
  });

  it('is stable when applied twice', () => {
    const once = sanitizeLogMessage('token=s3cret Bearer abc https://x.test/a?b=c');
    expect(sanitizeLogMessage(once)).toBe(once);
  });

  it.each([
    ['spaces', '{"password":"SECRET FIRST SECOND"}', '{"password":"[redacted]"}'],
    ['escaped quotes', '{"password":"SECRET \\"FIRST\\" SECOND"}', '{"password":"[redacted]"}'],
    ['a trailing backslash', '{"token":"SECRET\\\\","page":2}', '{"token":"[redacted]","page":2}'],
    ['single quotes', "{'secret':'SECRET FIRST'}", "{'secret':'[redacted]'}"],
    ['an unquoted key', 'password="SECRET FIRST" retried', 'password="[redacted]" retried'],
    ['a prefixed key', '{"client_secret":"SECRET FIRST"}', '{"client_secret":"[redacted]"}'],
    [
      'a JSON-encoded message',
      '{\\"password\\":\\"SECRET \\\\\\"FIRST\\\\\\" SECOND\\",\\"page\\":2}',
      '{\\"password\\":\\"[redacted]\\",\\"page\\":2}',
    ],
  ])('redacts a whole quoted value with %s', (_name, input, expected) => {
    expect(sanitizeLogMessage(input)).toBe(expected);
  });

  it('fails closed on an apostrophe inside a single-quoted value', () => {
    expect(sanitizeLogMessage("password='it's a secret'")).toBe("password='[redacted]'");
    expect(sanitizeLogMessage("password='it's a secret'\nnext line")).toBe(
      "password='[redacted]'\nnext line",
    );
  });

  it('heals a stored quoted value whose tail leaked past its apostrophe', () => {
    const healed = sanitizeLogMessage("password='[redacted]'s a secret'");
    expect(healed).toBe("password='[redacted]'");
    expect(healed).not.toContain('a secret');
  });

  it('keeps following text after a well-formed single-quoted value', () => {
    expect(sanitizeLogMessage("secret='abc' next")).toBe("secret='[redacted]' next");
  });

  it('fails closed when the single-quoted tail starts at a separator or a space', () => {
    expect(sanitizeLogMessage("password='it',s a secret tail'")).toBe("password='[redacted]'");
    expect(sanitizeLogMessage("password='james' secret tail'")).toBe("password='[redacted]'");
  });

  it('keeps the structure of a well-formed single-quoted JSON object', () => {
    expect(sanitizeLogMessage("{'secret':'abc','page':2}")).toBe(
      "{'secret':'[redacted]','page':2}",
    );
  });

  it('redacts a double-quoted value containing an apostrophe without failing closed', () => {
    expect(sanitizeLogMessage('password="it\'s a secret" next')).toBe('password="[redacted]" next');
  });

  it.each([
    [
      'a nested object',
      '{"Set-Cookie":{"nested":{"session":"SECRETNEST"},"other":"SECRETTAIL"},"page":2}',
      '{"Set-Cookie":"[redacted]","page":2}',
    ],
    [
      'braces inside strings',
      '{"cookie":{"a":"}","b":"SECRETTAIL"},"page":2}',
      '{"cookie":"[redacted]","page":2}',
    ],
    [
      'a nested array',
      '{"token":["SECRET",["]","SECRETTAIL"]],"page":2}',
      '{"token":"[redacted]","page":2}',
    ],
    [
      'an escaped object',
      '{\\"cookie\\":{\\"a\\":\\"}\\",\\"b\\":\\"SECRETTAIL\\"},\\"page\\":2}',
      '{\\"cookie\\":\\"[redacted]\\",\\"page\\":2}',
    ],
  ])('redacts a whole balanced value with %s', (_name, input, expected) => {
    expect(sanitizeLogMessage(input)).toBe(expected);
  });

  it.each([
    ['an unterminated string', '{"password":"SECRET FIRST'],
    ['an unterminated object', '{"cookie":{"a":"SECRET","b":"SECRETTAIL"'],
    ['mismatched brackets', '{"cookie":{"a":["SECRET"},"b":"SECRETTAIL"}'],
  ])('redacts to the end of the text after %s', (_name, input) => {
    const text = sanitizeLogMessage(input);
    expect(text).not.toContain('SECRET');
    expect(text).toContain('[redacted]');
  });

  it('keeps the fields around a redacted value', () => {
    expect(sanitizeLogMessage('{"page":2,"password":"a b","count":3}')).toBe(
      '{"page":2,"password":"[redacted]","count":3}',
    );
  });

  it.each([
    '{"password":"SECRET FIRST"}',
    '{"Set-Cookie":{"a":"SECRET"}}',
    '{\\"token\\":\\"SECRET FIRST\\"}',
    'password="SECRET FIRST"',
    'password=SECRET FIRST',
    'password=[redacted] FIRST',
    'Cookie: a=1; b=2',
    '{"token":123}',
  ])('is stable when applied twice to %s', (input) => {
    const once = sanitizeLogMessage(input);
    expect(sanitizeLogMessage(once)).toBe(once);
  });

  it('does not treat ordinary words as credentials', () => {
    const text = 'author: Mina, monkey=banana, invalid token: ';
    expect(sanitizeLogMessage(text)).toBe(text);
  });

  it('truncates long text', () => {
    expect(sanitizeLogMessage('a'.repeat(500))).toHaveLength(300);
  });
});

describe('sanitizeLogDetails', () => {
  it('keeps only allowlisted primitives', () => {
    expect(
      sanitizeLogDetails({
        operation: 'search',
        count: 2,
        token: 's3cret',
        nested: { a: 1 },
        endpoint: 'https://x.test/a?key=abc',
      }),
    ).toEqual({ operation: 'search', count: 2, endpoint: 'https://x.test/a' });
    expect(sanitizeLogDetails(undefined)).toBeUndefined();
    expect(sanitizeLogDetails({ token: 's3cret' })).toBeUndefined();
  });
});
