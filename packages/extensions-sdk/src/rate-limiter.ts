import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';

export interface RateLimiterOptions {
  readonly requestsPerMinute: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  readonly tryConsume: (key: string) => AppResult<{ readonly retryAfterMs: number } | Record<string, never>>;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const windowMs = 60_000;
  const max = Math.max(0, options.requestsPerMinute);
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, number[]>();

  function prune(key: string): number[] {
    const t = now();
    const arr = buckets.get(key) ?? [];
    const filtered = arr.filter((x) => t - x < windowMs);
    buckets.set(key, filtered);
    return filtered;
  }

  return {
    tryConsume(key: string): AppResult<{ readonly retryAfterMs: number } | Record<string, never>> {
      if (max === 0) {
        return err(
          createAppError({
            code: 'extensions.sdk.ratelimit.blocked',
            message: 'Rate limit is zero; request rejected.',
            details: { retryAfterMs: windowMs },
          }),
        );
      }
      const arr = prune(key);
      if (arr.length >= max) {
        const oldest = arr[0]!;
        const retryAfterMs = Math.max(0, Math.ceil(windowMs - (now() - oldest)));
        return err(
          createAppError({
            code: 'extensions.sdk.ratelimit.blocked',
            message: 'Rate limit exceeded.',
            details: { retryAfterMs },
          }),
        );
      }
      arr.push(now());
      buckets.set(key, arr);
      return ok({});
    },
  };
}
