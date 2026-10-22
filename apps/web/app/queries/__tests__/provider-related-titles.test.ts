import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDrizzleDb } from '@app/db/browser';
import type { ProviderContract } from '@app/extensions-sdk';
import type { MangaIdentity, MangaProviderMapping } from '@app/shared';
import { toProviderId, toProviderMangaId, toProviderMappingId } from '@app/shared';

const mocks = vi.hoisted(() => ({
  provider: null as unknown,
  resolveInstalledProvider: vi.fn<(db: unknown, providerId: string) => Promise<unknown>>(),
  getProviderBinding: vi.fn<(providerId: string) => unknown>(),
}));

vi.mock('../../lib/provider-registry.js', () => ({
  getProviderBinding: mocks.getProviderBinding,
  resolveInstalledProvider: mocks.resolveInstalledProvider,
}));

vi.mock('@app/extensions', () => ({
  loadProviderSettings: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({})),
  applyExplicitContentGate: <T>(settings: T): T => settings,
}));

import { fetchProviderRelatedTitles } from '../provider-query-options.js';

const db = {} as AppDrizzleDb;
const mapping: MangaProviderMapping = {
  id: toProviderMappingId('map-1'),
  providerId: toProviderId('fake'),
  providerMangaId: toProviderMangaId('remote-1'),
};

const identities: MangaIdentity[] = [
  {
    id: 'related-1' as MangaIdentity['id'],
    canonicalTitle: 'Related',
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [],
    defaultProviderMappingId: mapping.id,
    merged: false,
  },
];

function provider(capabilities: Record<string, boolean>): ProviderContract {
  return {
    manifest: { id: 'fake', name: 'Fake', capabilities },
    getRecommendations: vi.fn<() => Promise<{ items: readonly { id: string }[] }>>(async () => ({
      items: [{ id: 'remote-related' }],
    })),
    getRelatedTitles: vi.fn<() => Promise<{ items: readonly { id: string }[] }>>(async () => ({
      items: [{ id: 'remote-related' }],
    })),
  } as unknown as ProviderContract;
}

describe('fetchProviderRelatedTitles', () => {
  beforeEach(() => {
    mocks.resolveInstalledProvider.mockReset();
    mocks.getProviderBinding.mockReset().mockReturnValue({
      providerId: 'fake',
      toSearchIdentities: () => identities,
    });
  });

  it('calls the provider only when it declares the requested capability', async () => {
    const fake = provider({ 'metadata.recommendations': true });
    mocks.resolveInstalledProvider.mockResolvedValue(fake);

    await expect(fetchProviderRelatedTitles(db, mapping, 'recommendations')).resolves.toEqual(
      identities,
    );
    expect(fake.getRecommendations).toHaveBeenCalledWith(
      expect.anything(),
      mapping.providerMangaId,
    );

    const unsupported = provider({ 'metadata.recommendations': false });
    mocks.resolveInstalledProvider.mockResolvedValue(unsupported);
    await expect(fetchProviderRelatedTitles(db, mapping, 'recommendations')).resolves.toEqual([]);
    expect(unsupported.getRecommendations).not.toHaveBeenCalled();
  });

  it('keeps recommendations and related titles on separate capabilities', async () => {
    const fake = provider({ 'metadata.relatedTitles': true });
    mocks.resolveInstalledProvider.mockResolvedValue(fake);

    await expect(fetchProviderRelatedTitles(db, mapping, 'recommendations')).resolves.toEqual([]);
    expect(fake.getRecommendations).not.toHaveBeenCalled();
    await expect(fetchProviderRelatedTitles(db, mapping, 'relatedTitles')).resolves.toEqual(
      identities,
    );
    expect(fake.getRelatedTitles).toHaveBeenCalledTimes(1);
  });

  it('returns empty without a call when the provider is disabled or unresolved', async () => {
    mocks.resolveInstalledProvider.mockResolvedValue(null);

    await expect(fetchProviderRelatedTitles(db, mapping, 'recommendations')).resolves.toEqual([]);
  });

  it('normalizes a provider failure instead of returning partial identities', async () => {
    const fake = provider({ 'metadata.recommendations': true });
    Object.assign(fake, {
      getRecommendations: vi.fn<() => Promise<never>>(async () => {
        throw new Error('upstream exploded');
      }),
    });
    mocks.resolveInstalledProvider.mockResolvedValue(fake);

    await expect(fetchProviderRelatedTitles(db, mapping, 'recommendations')).rejects.toThrow(
      'An unexpected error occurred.',
    );
  });
});
