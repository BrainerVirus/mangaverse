import { describe, expect, it } from 'vitest';

describe('/extensions route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/extensions.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });

  it('falls back to install=false for invalid search params', async () => {
    const module = await import('../../routes/extensions.js');
    const validateSearch = module.Route.options.validateSearch;

    expect(validateSearch?.({ install: '1' })).toEqual({ install: true });
    expect(validateSearch?.({ install: 'true' })).toEqual({ install: false });
  });
});

describe('/extensions/$providerId route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/extensions.$providerId.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
