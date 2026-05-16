import { describe, expect, it } from 'vitest';

import { createRateLimiter } from './rate-limiter';

describe('createRateLimiter', () => {
  it('allows within limit', () => {
    let t = 0;
    const limiter = createRateLimiter({
      requestsPerMinute: 2,
      now: () => t,
    });
    expect(limiter.tryConsume('a').ok).toBe(true);
    expect(limiter.tryConsume('a').ok).toBe(true);
  });

  it('blocks when over limit until window advances', () => {
    let t = 0;
    const limiter = createRateLimiter({
      requestsPerMinute: 1,
      now: () => t,
    });
    expect(limiter.tryConsume('k').ok).toBe(true);
    const second = limiter.tryConsume('k');
    expect(second.ok).toBe(false);
    t += 60_001;
    expect(limiter.tryConsume('k').ok).toBe(true);
  });

  it('rejects all when rpm is zero', () => {
    const limiter = createRateLimiter({ requestsPerMinute: 0, now: () => 0 });
    expect(limiter.tryConsume('x').ok).toBe(false);
  });
});
