import { describe, expect, it } from 'vitest';

import { sanitizeLogDetails, sanitizeLogMessage } from './redact.js';

describe('sanitizeLogMessage', () => {
  it('removes bearer tokens, URL queries and credentials', () => {
    const text = sanitizeLogMessage(
      'GET https://x.test/a?token=s3cret&page=2 with Bearer abc.def password=hunter2',
    );
    expect(text).toBe('GET https://x.test/a with Bearer [redacted] password=[redacted]');
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
