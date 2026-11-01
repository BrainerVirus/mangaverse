import { describe, expect, it } from 'vitest';

// Static import: the first evaluation of a route module graph costs seconds under
// CPU contention, and Vitest would charge that to the test's 5s timeout when it is
// awaited inside the test body. Collection has no per-test timeout.
import { Route } from '../../routes/extensions.js';

describe('/extensions route', () => {
  it('falls back to install=false for invalid search params', () => {
    const validateSearch = Route.options.validateSearch;

    expect(validateSearch?.({ install: '1' })).toEqual({ install: true });
    expect(validateSearch?.({ install: 'true' })).toEqual({ install: false });
  });
});
