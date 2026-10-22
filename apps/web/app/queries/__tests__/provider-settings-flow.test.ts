import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDrizzleDb } from '@app/db/browser';
import type { ProviderContext, ProviderContract } from '@app/extensions-sdk';
import type { ExtensionInstallMetadata, MangaIdentity, ProviderSettingsValues } from '@app/shared';
import type { ProviderAppBinding } from '../../lib/provider-registry.js';

const mocks = vi.hoisted(() => ({
  loadProviderSettings:
    vi.fn<(db: unknown, providerId: string) => Promise<ProviderSettingsValues>>(),
  resolveInstalledProvider:
    vi.fn<(db: unknown, providerId: string) => Promise<ProviderContract | null>>(),
  resolveInstalledProviderFrom: vi.fn<() => ProviderContract | null>(),
  readInstalledExtensions: vi.fn<() => Promise<readonly ExtensionInstallMetadata[]>>(),
}));

vi.mock('@app/extensions', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, loadProviderSettings: mocks.loadProviderSettings };
});

const binding = {
  providerId: 'fake',
  sections: [
    { id: 'latest', title: 'Latest', capability: 'discovery.latest', browse: 'browseLatest' },
  ],
  toSearchIdentities: (items: readonly unknown[]) => items as readonly MangaIdentity[],
} as unknown as ProviderAppBinding;

vi.mock('../../lib/provider-registry.js', () => ({
  listProviderBindings: () => [binding],
  resolveInstalledProvider: mocks.resolveInstalledProvider,
  resolveInstalledProviderFrom: mocks.resolveInstalledProviderFrom,
  readInstalledExtensions: mocks.readInstalledExtensions,
}));

const db = {} as AppDrizzleDb;

function providerWithSettingsCapture(): {
  provider: ProviderContract;
  contexts: ProviderContext[];
} {
  const contexts: ProviderContext[] = [];
  const provider = {
    manifest: { id: 'fake', name: 'Fake', capabilities: { 'discovery.latest': true } },
    search: async (ctx: ProviderContext) => {
      contexts.push(ctx);
      return { items: [], hasMore: false };
    },
    browseLatest: async (ctx: ProviderContext) => {
      contexts.push(ctx);
      return { items: [], hasMore: false };
    },
  } as unknown as ProviderContract;
  return { provider, contexts };
}

describe('provider calls receive saved settings', () => {
  beforeEach(() => {
    mocks.loadProviderSettings.mockReset().mockResolvedValue({
      nsfwAllowed: true,
      contentRatingFilters: ['safe', 'explicit'],
      preferredLanguages: ['ja'],
    });
    mocks.resolveInstalledProviderFrom.mockReset();
    mocks.resolveInstalledProvider.mockReset();
    mocks.readInstalledExtensions.mockReset().mockResolvedValue([]);
  });

  it('Given saved settings, When searching, Then the provider context carries them gated by app explicit content', async () => {
    const { provider, contexts } = providerWithSettingsCapture();
    mocks.resolveInstalledProvider.mockResolvedValue(provider);
    const { fetchProviderSearchIdentities } = await import('../provider-query-options.js');

    await fetchProviderSearchIdentities(db, 'query', undefined, false);

    expect(mocks.loadProviderSettings).toHaveBeenCalledWith(db, 'fake');
    expect(contexts[0]?.settings).toEqual({
      nsfwAllowed: false,
      contentRatingFilters: ['safe'],
      preferredLanguages: ['ja'],
    });
  });

  it('Given app explicit content, When searching, Then provider settings pass through', async () => {
    const { provider, contexts } = providerWithSettingsCapture();
    mocks.resolveInstalledProvider.mockResolvedValue(provider);
    const { fetchProviderSearchIdentities } = await import('../provider-query-options.js');

    await fetchProviderSearchIdentities(db, 'query', undefined, true);

    expect(contexts[0]?.settings).toEqual({
      nsfwAllowed: true,
      contentRatingFilters: ['safe', 'explicit'],
      preferredLanguages: ['ja'],
    });
  });

  it('Given saved settings, When discover and a section page load, Then browse calls carry them', async () => {
    const { provider, contexts } = providerWithSettingsCapture();
    mocks.resolveInstalledProviderFrom.mockReturnValue(provider);
    mocks.resolveInstalledProvider.mockResolvedValue(provider);
    const { fetchProviderDiscoverData, fetchProviderSectionPage } =
      await import('../provider-discover.js');

    await fetchProviderDiscoverData(db);
    await fetchProviderSectionPage(db, binding, 'latest', 0, 6);

    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.settings).toMatchObject({ preferredLanguages: ['ja'] });
    expect(contexts[1]?.settings).toMatchObject({ preferredLanguages: ['ja'] });
  });
});
