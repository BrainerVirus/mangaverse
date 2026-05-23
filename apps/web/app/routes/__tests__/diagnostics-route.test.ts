import { describe, expect, it } from 'vitest';

describe('/diagnostics route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../diagnostics.lazy.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
