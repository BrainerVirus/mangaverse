import { describe, expect, it } from 'vitest';

describe('/search route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../search.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
