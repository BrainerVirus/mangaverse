import type { AppDrizzleDb } from '@app/db';
import { describe, expect, it } from 'vitest';

import { searchProviderQueryOptions, shouldRetryProviderSearch } from '../search-query-options.js';

const db = {} as AppDrizzleDb;

function retryOfProviderSearch(): (failureCount: number, error: unknown) => boolean {
  const retry = searchProviderQueryOptions(db, 'mangadex', 'berserk').retry;
  if (typeof retry !== 'function') {
    throw new Error('expected the provider search to use a retry predicate');
  }
  return retry;
}

describe('provider search retry policy', () => {
  it('Given a rate-limit failure, Then it is never retried', () => {
    const rateLimited = {
      code: 'extensions.sdk.ratelimit.blocked',
      message: 'Request was aborted while waiting for a rate-limit slot.',
    };

    expect(shouldRetryProviderSearch(0, rateLimited)).toBe(false);
    expect(retryOfProviderSearch()(0, rateLimited)).toBe(false);
  });

  it('Given a wrapped 429, Then it is not retried', () => {
    const wrapped = new Error('Provider search is unavailable.', {
      cause: {
        code: 'extensions.sdk.request.http_error',
        message: 'HTTP 429.',
        details: { status: 429, retryAfterMs: 2_000 },
      },
    });

    expect(shouldRetryProviderSearch(0, wrapped)).toBe(false);
  });

  it('Given a transient failure, Then it is retried once', () => {
    const transient = new Error('provider offline');

    expect(shouldRetryProviderSearch(0, transient)).toBe(true);
    expect(shouldRetryProviderSearch(1, transient)).toBe(false);
    expect(retryOfProviderSearch()(0, transient)).toBe(true);
  });

  it('Given an unrelated HTTP failure, Then it keeps the one transient retry', () => {
    const serverError = new Error('HTTP 500.', {
      cause: {
        code: 'extensions.sdk.request.http_error',
        message: 'HTTP 500.',
        details: { status: 500 },
      },
    });

    expect(shouldRetryProviderSearch(0, serverError)).toBe(true);
  });
});
