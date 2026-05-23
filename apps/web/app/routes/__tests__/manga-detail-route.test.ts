import { describe, expect, it } from 'vitest';

describe('/manga/$id route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../manga.$id.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
