import { describe, expect, it } from 'vitest';

describe('/settings/app route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/settings.app.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });
});
