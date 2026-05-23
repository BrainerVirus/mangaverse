import { describe, expect, it } from 'vitest';

describe('/backup route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../backup.lazy.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
