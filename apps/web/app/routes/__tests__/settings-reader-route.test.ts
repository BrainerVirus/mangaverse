import { describe, expect, it } from 'vitest';

describe('/settings/reader route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../settings.reader.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
