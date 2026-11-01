import { describe, it, expect } from 'vitest';

// Static import: the first evaluation of a route module graph costs seconds under
// CPU contention, and Vitest would charge that to the test's 5s timeout when it is
// awaited inside the test body. Collection has no per-test timeout.
import { Route } from '../../routes/storage.lazy.js';

describe('/storage route', () => {
  it('exports a TanStack route definition', () => {
    expect(Route).toBeDefined();
    expect(typeof Route.options.component).toBe('function');
  });
});
