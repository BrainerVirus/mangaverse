import { describe, expect, it } from 'vitest';

describe('/theme/editor route', () => {
  it('exports a lazy TanStack route definition', async () => {
    const module = await import('../../routes/theme.editor.lazy.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
