import { describe, expect, it } from 'vitest';

describe('/theme route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../theme.lazy.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
