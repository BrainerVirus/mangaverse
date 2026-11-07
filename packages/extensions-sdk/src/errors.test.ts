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

  it('keeps diagnostic details but never copies headers or arbitrary fields', () => {
    const e = normalizeProviderError(
      {
        code: 'upstream',
        message: 'bad',
        details: {
          authorization: 'Bearer secret',
          cookie: 'a=b',
          errno: 'CERT_HAS_EXPIRED',
          address: '93.184.216.34',
          retryAfterMs: 25_000,
        },
      } as never,
      { url: 'https://api.example.com/r' },
    );
    expect(e.details).toMatchObject({
      url: 'https://api.example.com/r',
      errno: 'CERT_HAS_EXPIRED',
      address: '93.184.216.34',
      retryAfterMs: 25_000,
    });
    expect((e.details as Record<string, unknown> | undefined)?.authorization).toBeUndefined();
    expect((e.details as Record<string, unknown> | undefined)?.cookie).toBeUndefined();
  });

  it('maps timeout errors', () => {
    const e = normalizeProviderError(new Error('timeout'));
    expect(e.code).toBe('extensions.sdk.request.timeout');
  });
});
