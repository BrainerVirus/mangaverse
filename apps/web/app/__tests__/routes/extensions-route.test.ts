import { describe, expect, it } from 'vitest';

// Static imports: the first evaluation of a route module graph costs seconds under
// CPU contention, and Vitest would charge that to the test's 5s timeout when it is
// awaited inside the test body. Collection has no per-test timeout.
import { Route } from '../../routes/extensions.js';
import { Route as ProviderRoute } from '../../routes/extensions.$providerId.js';

describe('/extensions route', () => {
  it('exports a TanStack route definition', () => {
    expect(Route).toBeDefined();
    expect(typeof Route.options.component).toBe('function');
  });

  it('falls back to install=false for invalid search params', () => {
    const validateSearch = Route.options.validateSearch;

    expect(validateSearch?.({ install: '1' })).toEqual({ install: true });
    expect(validateSearch?.({ install: 'true' })).toEqual({ install: false });
  });
});

describe('/extensions/$providerId route', () => {
  it('exports a TanStack route definition', () => {
    expect(ProviderRoute).toBeDefined();
    expect(typeof ProviderRoute.options.component).toBe('function');
  });
});
