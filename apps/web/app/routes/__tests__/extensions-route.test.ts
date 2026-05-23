import { describe, expect, it } from 'vitest';

describe('/extensions route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../extensions.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});

describe('/extensions/$providerId route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../extensions.$providerId.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
