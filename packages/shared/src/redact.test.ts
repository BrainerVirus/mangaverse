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
