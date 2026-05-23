import { describe, expect, it } from 'vitest';

describe('@app/extensions', () => {
  it('exports the extensions feature surface', async () => {
    const module = await import('./index.js');
    expect(module.fetchExtensionsPage).toBeTypeOf('function');
    expect(module.fetchProviderDetail).toBeTypeOf('function');
    expect(module.ExtensionsPage).toBeTypeOf('function');
    expect(module.ProviderDetailPage).toBeTypeOf('function');
    expect(module.InstallProviderDialog).toBeTypeOf('function');
  });
});
