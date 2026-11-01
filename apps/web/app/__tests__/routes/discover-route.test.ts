import { describe, expect, it } from 'vitest';

// Static imports: the first evaluation of a route module graph costs seconds under
// CPU contention, and Vitest would charge that to the test's 5s timeout when it is
// awaited inside the test body. Collection has no per-test timeout.
import { Route } from '../../routes/discover.js';

describe('/discover route', () => {
  it('exports a TanStack route definition', () => {
    expect(Route).toBeDefined();
    expect(typeof Route.options.component).toBe('function');
  });

  it('falls back for invalid search params', () => {
    const validateSearch = Route.options.validateSearch;

    expect(validateSearch?.({ provider: 'mangadex', section: 'popular' })).toEqual({
      provider: 'mangadex',
      section: 'popular',
    });
    expect(validateSearch?.({ provider: 42, section: ['bad'] })).toEqual({});
  });
});
