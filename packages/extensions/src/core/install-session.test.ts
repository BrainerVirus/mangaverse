import { describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import { createExtensionInstallSession, transitionExtensionInstall } from './install-session';

const miniManifest = (): ProviderManifest => ({
  id: toProviderId('p'),
  name: 'N',
  version: '1',
  source: { url: 'https://src' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
});

const miniPreview = (url: string) => ({
  providerName: 'N',
  providerId: 'p',
  version: '1',
  sourceUrl: 'https://src',
  manifestUrl: url,
  platforms: ['web'] as const,
  capabilities: { 'discovery.search': true } as ProviderManifest['capabilities'],
  capabilityLimitations: [] as const,
  permissions: ['network.http'] as const,
  languages: ['en'] as const,
  contentFlags: { nsfw: false, suggestive: false, violence: false },
  checksumStatus: 'absent' as const,
  signatureStatus: 'absent' as const,
  warnings: [] as const,
});

describe('transitionExtensionInstall', () => {
  it('moves manual start to fetching then confirmation', () => {
    const url = 'https://x/m.json';
    let s = createExtensionInstallSession();
    s = transitionExtensionInstall(s, { type: 'startFromManualUrl', url });
    expect(s.step).toBe('fetchingManifest');
    const m = miniManifest();
    s = transitionExtensionInstall(s, {
      type: 'manifestFetched',
      manifest: m,
      preview: miniPreview(url),
      source: { kind: 'manual', manifestUrl: url },
    });
    expect(s.step).toBe('awaitingConfirmation');
    s = transitionExtensionInstall(s, { type: 'confirm' });
    expect(s.step).toBe('installing');
    s = transitionExtensionInstall(s, { type: 'installSucceeded' });
    expect(s.step).toBe('installed');
  });

  it('cancels from awaiting confirmation', () => {
    const url = 'https://x/m.json';
    let s = createExtensionInstallSession();
    s = transitionExtensionInstall(s, { type: 'startFromManualUrl', url });
    const m = miniManifest();
    s = transitionExtensionInstall(s, {
      type: 'manifestFetched',
      manifest: m,
      preview: miniPreview(url),
      source: { kind: 'manual', manifestUrl: url },
    });
    s = transitionExtensionInstall(s, { type: 'cancel' });
    expect(s.step).toBe('cancelled');
  });
});
