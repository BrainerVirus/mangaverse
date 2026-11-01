/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as MigrationModule from '@/features/migration/index.js';
import type { MigrationCandidate, MigrationProviderOption } from '@/features/migration/index.js';

const mocks = vi.hoisted(() => ({
  fetchProviders: vi.fn<() => Promise<MigrationProviderOption[]>>(),
  fetchCandidates: vi.fn<() => Promise<MigrationCandidate[]>>(),
  fetchHistory: vi.fn<() => Promise<never[]>>(),
  getMangaIdentities: vi.fn<(db: unknown, mangaIds: readonly string[]) => Promise<unknown[]>>(),
}));

vi.mock('@/features/migration/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MigrationModule>();
  return {
    ...actual,
    fetchMigrationProviders: mocks.fetchProviders,
    fetchMigrationCandidates: mocks.fetchCandidates,
    fetchMigrationHistory: mocks.fetchHistory,
  };
});

vi.mock('@app/db', () => ({
  getMangaIdentities: mocks.getMangaIdentities,
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'fake-db' }),
  useLocalDbStatus: () => 'ready',
}));

import { useMigrationController } from '../../queries/use-migration-controller.js';
import type { MigrationSearch } from '../../lib/migration-search.js';

const providers: readonly MigrationProviderOption[] = [
  { id: 'source', name: 'Source', enabled: true },
  { id: 'target', name: 'Target', enabled: true },
];

function candidate(mangaId: string): MigrationCandidate {
  return {
    mangaId,
    canonicalTitle: mangaId,
    sourceProviderMangaId: `${mangaId}-source`,
    sourceMappingId: `${mangaId}-mapping`,
    isDefaultProvider: true,
    isActiveProvider: true,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Controller output is read from attributes, never assigned during render. */
async function renderController(search: MigrationSearch): Promise<void> {
  function Probe() {
    const props = useMigrationController(search);
    return (
      <output
        data-testid="migration-probe"
        data-provider-count={String(props.providers.length)}
        data-source={props.sourceProviderId ?? ''}
        data-requested-sources={props.requestedSourceProviderIds.join(',')}
        data-unavailable={props.unavailableRequestedSourceProviderId ?? ''}
        data-candidates={props.candidates.map((item) => item.mangaId).join(',')}
        data-skipped={props.skippedRequestedIds.join(',')}
        data-titles={Object.entries(props.requestedTitles)
          .map(([mangaId, title]) => [mangaId, title].join('='))
          .join('|')}
        data-handoff={props.handoffError ?? ''}
        data-handoff-count={props.handoffIdCount === undefined ? '' : String(props.handoffIdCount)}
      />
    );
  }

  container = document.createElement('div');
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
}

function probeAttribute(name: string): string | null {
  return container?.querySelector('[data-testid="migration-probe"]')?.getAttribute(name) ?? null;
}

beforeEach(() => {
  mocks.fetchProviders.mockReset();
  mocks.fetchCandidates.mockReset();
  mocks.fetchHistory.mockReset();
  mocks.getMangaIdentities.mockReset();
  mocks.fetchProviders.mockResolvedValue(providers);
  mocks.fetchCandidates.mockResolvedValue([candidate('m1'), candidate('m2')]);
  mocks.fetchHistory.mockResolvedValue([]);
  mocks.getMangaIdentities.mockResolvedValue([]);
});

afterEach(() => {
  if (root !== null) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe('useMigrationController hand-off glue', () => {
  it('Given two source providers, When the hand-off loads, Then it waits for a choice and shows no candidates', async () => {
    await renderController({ ids: ['m1', 'm2'], sources: ['source', 'target'] });

    await vi.waitFor(() => expect(probeAttribute('data-provider-count')).toBe('2'));
    expect(probeAttribute('data-source')).toBe('');
    expect(probeAttribute('data-requested-sources')).toBe('source,target');
    expect(probeAttribute('data-candidates')).toBe('');
    expect(probeAttribute('data-skipped')).toBe('');
  });

  it('Given an unavailable prefilled source, When the hand-off loads, Then every requested id is skipped with its title', async () => {
    mocks.getMangaIdentities.mockResolvedValue([{ id: 'm1', canonicalTitle: 'Solo Leveling' }]);

    await renderController({ ids: ['m1'], sources: ['gone'] });

    await vi.waitFor(() => expect(probeAttribute('data-unavailable')).toBe('gone'));
    expect(probeAttribute('data-source')).toBe('');
    expect(probeAttribute('data-candidates')).toBe('');
    expect(probeAttribute('data-skipped')).toBe('m1');
    await vi.waitFor(() => expect(probeAttribute('data-titles')).toBe('m1=Solo Leveling'));
  });

  it('Given stale requested ids, When candidates load, Then only known titles stay and the rest are skipped with titles', async () => {
    mocks.getMangaIdentities.mockResolvedValue([{ id: 'gone', canonicalTitle: 'Deleted Title' }]);

    await renderController({ ids: ['m1', 'gone'], sources: ['source'] });

    await vi.waitFor(() => {
      expect(probeAttribute('data-source')).toBe('source');
      expect(probeAttribute('data-candidates')).toBe('m1');
    });
    expect(probeAttribute('data-skipped')).toBe('gone');
    await vi.waitFor(() => expect(probeAttribute('data-titles')).toBe('gone=Deleted Title'));
  });

  it('Given a rejected link, When the controller loads, Then batch mode stays off', async () => {
    await renderController({ handoffError: 'too-many', handoffIdCount: 201 });

    await vi.waitFor(() => expect(probeAttribute('data-provider-count')).toBe('2'));
    expect(probeAttribute('data-handoff')).toBe('too-many');
    expect(probeAttribute('data-handoff-count')).toBe('201');
    expect(probeAttribute('data-source')).toBe('');
    expect(probeAttribute('data-candidates')).toBe('');
  });
});
