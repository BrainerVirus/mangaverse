import { describe, expect, it } from 'vitest';

import { normalizeProviderError } from './errors';

describe('normalizeProviderError', () => {
  it('passes through AppError-like objects', () => {
    const e = normalizeProviderError({ code: 'x', message: 'm' });
    expect(e.code).toBe('x');
  });

  it('redacts query and fragment from url in details', () => {
    const e = normalizeProviderError(new Error('timeout'), {
      url: 'https://example.com/path?token=secret#frag',
    });
    expect(e.details?.url).toBe('https://example.com/path');
  });

  it('does not copy arbitrary details from AppError-like input (no headers leak)', () => {
    const e = normalizeProviderError(
      {
        code: 'upstream',
        message: 'bad',
        details: { authorization: 'Bearer secret', cookie: 'a=b' },
      } as never,
      { url: 'https://api.example.com/r' },
    );
    expect((e.details as Record<string, unknown> | undefined)?.authorization).toBeUndefined();
    expect((e.details as Record<string, unknown> | undefined)?.cookie).toBeUndefined();
    expect(e.details?.url).toBe('https://api.example.com/r');
  });

  it('maps timeout errors', () => {
    const e = normalizeProviderError(new Error('timeout'));
    expect(e.code).toBe('extensions.sdk.request.timeout');
  });
});
