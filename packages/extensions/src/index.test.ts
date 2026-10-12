import { describe, expect, it } from 'vitest';
// Static import so the feature graph loads at collection time; a lazy import
// exceeded the 5s per-test budget on cold CI runners.
import * as extensions from './index.js';

describe('@app/extensions', () => {
  it('exports the extensions feature surface', () => {
    expect(extensions.fetchExtensionsPage).toBeTypeOf('function');
    expect(extensions.fetchProviderDetail).toBeTypeOf('function');
    expect(extensions.ExtensionsPage).toBeTypeOf('function');
    expect(extensions.ProviderDetailPage).toBeTypeOf('function');
    expect(extensions.InstallProviderDialog).toBeTypeOf('function');
  });
});
