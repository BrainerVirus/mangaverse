import { describe, expect, it } from 'vitest';

describe('/discover route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/discover.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });

  it('falls back for invalid search params', async () => {
    const module = await import('../../routes/discover.js');
    const validateSearch = module.Route.options.validateSearch;

    expect(validateSearch?.({ provider: 'mangadex', section: 'popular' })).toEqual({
      provider: 'mangadex',
      section: 'popular',
    });
    expect(validateSearch?.({ provider: 42, section: ['bad'] })).toEqual({});
  });
});
