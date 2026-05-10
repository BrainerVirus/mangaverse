import { describe, expect, it } from 'vitest';
import { createAppError, err, ok } from './result';

describe('result helpers', () => {
  it('ok wraps value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('err wraps error', () => {
    const e = createAppError({ code: 'x', message: 'm' });
    const r = err(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual(e);
  });

  it('createAppError includes optional fields', () => {
    const cause = new Error('root');
    const e = createAppError({
      code: 'prov.timeout',
      message: 'Timed out',
      cause,
      providerId: 'prov-1',
      retryable: true,
      details: { ms: 5000 },
    });
    expect(e.code).toBe('prov.timeout');
    expect(e.message).toBe('Timed out');
    expect(e.cause).toBe(cause);
    expect(e.providerId).toBe('prov-1');
    expect(e.retryable).toBe(true);
    expect(e.details).toEqual({ ms: 5000 });
  });

  it('createAppError omits undefined optionals', () => {
    const e = createAppError({ code: 'a', message: 'b' });
    expect('cause' in e).toBe(false);
    expect('providerId' in e).toBe(false);
    expect('retryable' in e).toBe(false);
    expect('details' in e).toBe(false);
  });
});
