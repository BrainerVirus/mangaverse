import { describe, expect, it } from 'vitest';

describe('/library route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/library.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
