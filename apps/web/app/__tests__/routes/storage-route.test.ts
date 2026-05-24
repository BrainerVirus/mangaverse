import { describe, it, expect } from 'vitest';

describe('/storage route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/storage.lazy.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
