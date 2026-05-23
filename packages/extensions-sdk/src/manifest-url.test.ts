import { describe, expect, it } from 'vitest';

import { validateRemoteManifestUrlForFetch } from './manifest-url';

describe('validateRemoteManifestUrlForFetch', () => {
  it('accepts https', () => {
    const r = validateRemoteManifestUrlForFetch('https://cdn.example/manifest.json');
    expect(r.ok && r.value).toContain('https://');
  });

  it('rejects file scheme', () => {
    expect(validateRemoteManifestUrlForFetch('file:///tmp/x.json').ok).toBe(false);
  });

  it('rejects direct js path', () => {
    expect(validateRemoteManifestUrlForFetch('https://x/provider.js').ok).toBe(false);
  });
});
