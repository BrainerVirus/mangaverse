import { describe, expect, it } from 'vitest';

describe('/reader/$chapterId route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/reader.$chapterId.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
