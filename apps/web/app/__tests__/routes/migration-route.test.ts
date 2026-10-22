import { describe, expect, it } from 'vitest';

describe('/migration route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/migration.lazy.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });

  it('validates the library bulk hand-off search params', async () => {
    const module = await import('../../routes/migration.js');
    const validateSearch = module.Route.options.validateSearch;

    expect(
      validateSearch?.({
        ids: ['m1', ' m2 ', 'm1', '', 42],
        sources: ['mangadex', 'mangadex', 'target'],
      }),
    ).toEqual({ ids: ['m1', 'm2'], sources: ['mangadex', 'target'] });
    expect(validateSearch?.({ ids: 'm1', sources: { provider: 'x' } })).toEqual({});
    expect(validateSearch?.({ ids: ['', '   '], sources: [] })).toEqual({});
  });
});
