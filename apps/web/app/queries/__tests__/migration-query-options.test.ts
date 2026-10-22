import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveInstalledProvider } = vi.hoisted(() => ({
  resolveInstalledProvider: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('../../lib/provider-registry.js', () => ({ resolveInstalledProvider }));

import {
  migrationTargetSearchQueryOptions,
  searchProviderMangaTargets,
} from '../migration-query-options.js';

const db = { id: 'fake-db' } as never;

function provider(search?: (...args: unknown[]) => unknown) {
  return { manifest: { id: 'target' }, ...(search !== undefined ? { search } : {}) };
}

describe('searchProviderMangaTargets', () => {
  beforeEach(() => {
    resolveInstalledProvider.mockReset();
  });

  it('maps provider search items to raw target ids', async () => {
    resolveInstalledProvider.mockResolvedValue(
      provider(async () => ({ items: [{ providerMangaId: 'remote-1', title: 'One Piece' }] })),
    );

    const results = await searchProviderMangaTargets(db, 'target', '  one piece  ');

    expect(results).toEqual([{ providerMangaId: 'remote-1', title: 'One Piece' }]);
  });

  it('rejects when the target provider is not installed or disabled', async () => {
    resolveInstalledProvider.mockResolvedValue(null);

    await expect(searchProviderMangaTargets(db, 'target', 'Naruto')).rejects.toThrow(
      /not installed or enabled/,
    );
  });

  it('rejects when the target provider cannot search', async () => {
    resolveInstalledProvider.mockResolvedValue(provider());

    await expect(searchProviderMangaTargets(db, 'target', 'Naruto')).rejects.toThrow(
      /does not support search/,
    );
  });

  it('propagates provider failures so the caller can report them', async () => {
    resolveInstalledProvider.mockResolvedValue(
      provider(async () => {
        throw new Error('provider unavailable');
      }),
    );

    await expect(searchProviderMangaTargets(db, 'target', 'Naruto')).rejects.toThrow(
      'provider unavailable',
    );
  });
});

describe('migrationTargetSearchQueryOptions', () => {
  beforeEach(() => {
    resolveInstalledProvider.mockReset();
  });

  it('stays disabled without a provider or query', () => {
    expect(migrationTargetSearchQueryOptions(db, null, 'Naruto').enabled).toBe(false);
    expect(migrationTargetSearchQueryOptions(db, 'target', '   ').enabled).toBe(false);
    expect(migrationTargetSearchQueryOptions(db, 'target', 'Naruto').enabled).toBe(true);
  });

  it('returns a ranked outcome and turns provider errors into row state', async () => {
    resolveInstalledProvider.mockResolvedValue(
      provider(async () => ({
        items: [
          { providerMangaId: 'far', title: 'One Piece' },
          { providerMangaId: 'exact', title: 'Naruto' },
        ],
      })),
    );

    const options = migrationTargetSearchQueryOptions(db, 'target', 'Naruto');
    const outcome = await options.queryFn!({} as never);

    expect(outcome).toMatchObject({ status: 'ok' });
    if (outcome.status !== 'ok') return;
    expect(outcome.results[0]?.providerMangaId).toBe('exact');

    resolveInstalledProvider.mockResolvedValue(provider());
    const failed = await migrationTargetSearchQueryOptions(db, 'target', 'Naruto').queryFn!(
      {} as never,
    );
    expect(failed.status).toBe('error');
    if (failed.status !== 'error') return;
    expect(failed.message).toMatch(/does not support search/);
  });
});
