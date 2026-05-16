import { describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import { validateProviderSettings } from './settings';
import { buildCapabilityDisplay, buildPermissionDisplay } from './display';

const manifest = (): ProviderManifest => ({
  id: toProviderId('p'),
  name: 'P',
  version: '1',
  source: { url: 'https://s' },
  compatibility: { platforms: ['web'] },
  capabilities: {
    'metadata.languages': true,
    'content.nsfw': true,
    'content.tagFilter': true,
    'auth.login': true,
    'content.ratingFilter': true,
  },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: true, suggestive: false, violence: false },
});

describe('validateProviderSettings', () => {
  it('rejects nsfw when manifest lacks support', () => {
    const m: ProviderManifest = {
      ...manifest(),
      capabilities: { 'metadata.details': true },
      contentFlags: { nsfw: false, suggestive: false, violence: false },
    };
    const r = validateProviderSettings(m, { nsfwAllowed: true });
    expect(r.ok).toBe(false);
  });

  it('accepts nsfw when content.nsfw capability is true', () => {
    const r = validateProviderSettings(manifest(), { nsfwAllowed: true });
    expect(r.ok).toBe(true);
  });
});

describe('buildCapabilityDisplay', () => {
  it('includes declared capabilities', () => {
    const rows = buildCapabilityDisplay(manifest());
    expect(rows.some((r) => r.key === 'auth.login')).toBe(true);
  });
});

describe('buildPermissionDisplay', () => {
  it('maps permissions to labels', () => {
    const rows = buildPermissionDisplay(manifest());
    expect(rows[0]?.label.length).toBeGreaterThan(0);
  });
});
