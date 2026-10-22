/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MigrationPreviewReport } from '@app/db';

import { MigrationPage, type MigrationPageProps } from './MigrationPage.js';
import { MIGRATION_BATCH_LIMIT } from '../batch-migration.js';
import type { MigrationCandidate, MigrationSearchResult } from '../types.js';

afterEach(() => {
  cleanup();
});

const candidate: MigrationCandidate = {
  mangaId: 'm1',
  canonicalTitle: 'Solo Leveling',
  sourceProviderMangaId: 'source-1',
  sourceMappingId: 'mapping-1',
  isDefaultProvider: true,
  isActiveProvider: true,
};

const result: MigrationSearchResult = {
  providerMangaId: 'target-1',
  title: 'Solo Leveling',
  confidence: 1,
};

function pageProps(overrides: Partial<MigrationPageProps> = {}): MigrationPageProps {
  return {
    isLoading: false,
    isError: false,
    providers: [
      { id: 'source', name: 'Source', enabled: true },
      { id: 'target', name: 'Target', enabled: true },
    ],
    candidates: [candidate],
    sourceProviderId: 'source',
    targetProviderId: 'target',
    selections: {},
    searchQueries: { m1: 'Solo Leveling' },
    committedSearchQueries: { m1: 'Solo Leveling' },
    targetSearches: {
      m1: { isLoading: false, error: null, results: [result] },
    },
    preview: null,
    applyReport: null,
    applyError: null,
    canRollback: false,
    rollbackSummary: null,
    rollbackError: null,
    history: [],
    onSourceProviderChange: vi.fn<(providerId: string) => void>(),
    onTargetProviderChange: vi.fn<(providerId: string) => void>(),
    onTargetMangaIdChange: vi.fn<(mangaId: string, targetProviderMangaId: string) => void>(),
    onSearchQueryChange: vi.fn<(mangaId: string, query: string) => void>(),
    onRetryTargetSearch: vi.fn<(mangaId: string) => void>(),
    onSelectAllMatched: vi.fn<() => void>(),
    onDeselectAll: vi.fn<() => void>(),
    onPreview: vi.fn<() => void>(),
    onApply: vi.fn<() => void>(),
    onClearPreview: vi.fn<() => void>(),
    onDismissApplyStatus: vi.fn<() => void>(),
    onRollback: vi.fn<() => void>(),
    onOpenBackup: vi.fn<() => void>(),
    ...overrides,
  };
}

describe('MigrationPage target search', () => {
  it('hides results that belong to the committed query while the input is newer', () => {
    const { rerender } = render(
      <MigrationPage
        {...pageProps({
          searchQueries: { m1: 'Solo Leveling Ragnarok' },
          committedSearchQueries: { m1: 'Solo Leveling' },
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: /Solo Leveling exact target-1/ })).toBeNull();
    expect(screen.getByText('Searching Target…')).toBeInTheDocument();

    rerender(<MigrationPage {...pageProps()} />);
    expect(
      screen.getByRole('button', { name: /Solo Leveling exact target-1/ }),
    ).toBeInTheDocument();
  });

  it('shows the retry as loading instead of keeping the old row error', () => {
    render(
      <MigrationPage
        {...pageProps({
          targetSearches: {
            m1: { isLoading: true, error: 'provider unavailable', results: [] },
          },
        })}
      />,
    );

    expect(screen.queryByText('provider unavailable')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByText('Searching Target…')).toBeInTheDocument();
  });
});

describe('MigrationPage library hand-off', () => {
  it('warns that the selection spans multiple source providers and asks to choose one', () => {
    render(
      <MigrationPage
        {...pageProps({
          sourceProviderId: null,
          requestedMangaIds: ['m1', 'm2'],
          requestedSourceProviderIds: ['source', 'target'],
        })}
      />,
    );

    expect(screen.getByText('Multiple source providers in this selection')).toBeInTheDocument();
    expect(
      screen.getByText(/preferred provider mapping across Source, Target/),
    ).toBeInTheDocument();
    expect(screen.getByText(/choose the provider whose mappings/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Migration candidates' })).toBeNull();
  });

  it('lists stale requested ids with titles and keeps the list out of the description paragraph', () => {
    render(
      <MigrationPage
        {...pageProps({
          requestedMangaIds: ['m1', 'gone'],
          requestedSourceProviderIds: ['source'],
          skippedRequestedIds: ['gone'],
          requestedTitles: { gone: 'Deleted Title' },
        })}
      />,
    );

    expect(screen.getByText('Some selected titles were skipped')).toBeInTheDocument();
    expect(
      screen.getByText(/no longer in the library or have no mapping on Source/),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Skipped selected titles' });
    expect(list).toHaveTextContent('Deleted Title');
    expect(list.closest('p')).toBeNull();
  });

  it('falls back to the raw id when no title is known', () => {
    render(
      <MigrationPage
        {...pageProps({
          requestedMangaIds: ['m1', 'gone'],
          requestedSourceProviderIds: ['source'],
          skippedRequestedIds: ['gone'],
        })}
      />,
    );

    expect(screen.getByRole('list', { name: 'Skipped selected titles' })).toHaveTextContent('gone');
  });

  it('names an unavailable prefilled provider, lists its titles, and blocks candidates', () => {
    render(
      <MigrationPage
        {...pageProps({
          sourceProviderId: null,
          requestedMangaIds: ['m1', 'm2'],
          requestedSourceProviderIds: ['gone'],
          unavailableRequestedSourceProviderId: 'gone',
          skippedRequestedIds: ['m1', 'm2'],
          requestedTitles: { m1: 'Solo Leveling' },
        })}
      />,
    );

    expect(screen.getByText('Selected source provider is unavailable')).toBeInTheDocument();
    expect(screen.getByText(/gone is not installed or enabled/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Skipped selected titles' });
    expect(list).toHaveTextContent('Solo Leveling');
    expect(list).toHaveTextContent('m2');
    expect(screen.queryByRole('list', { name: 'Migration candidates' })).toBeNull();
  });

  it('blocks batch mode for an invalid link until the hand-off is cleared', () => {
    const onClearHandoff = vi.fn<() => void>();
    render(<MigrationPage {...pageProps({ handoffError: 'invalid', onClearHandoff })} />);

    expect(screen.getByText('Invalid migration link')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Source provider' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Migration candidates' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview migration' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear this link' }));
    expect(onClearHandoff).toHaveBeenCalledTimes(1);
  });

  it('rejects an over-limit link with the cap instead of truncating it', () => {
    render(
      <MigrationPage
        {...pageProps({
          handoffError: 'too-many',
          handoffIdCount: MIGRATION_BATCH_LIMIT + 1,
        })}
      />,
    );

    expect(screen.getByText('Too many titles for one migration batch')).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`carries ${MIGRATION_BATCH_LIMIT + 1} titles`)),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`at most ${MIGRATION_BATCH_LIMIT}`))).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Migration candidates' })).toBeNull();
  });
});

describe('MigrationPage review dialog', () => {
  const preview: MigrationPreviewReport = {
    sourceProviderId: 'source',
    targetProviderId: 'target',
    canApply: true,
    items: [
      {
        mangaId: 'm1' as MigrationPreviewReport['items'][number]['mangaId'],
        canonicalTitle: 'Solo Leveling',
        sourceProviderId: 'source',
        sourceProviderMangaId: 'source-1',
        targetProviderId: 'target',
        targetProviderMangaId: 'target-1',
        targetProviderTitle: 'Solo Leveling (Official)',
        willAddMapping: true,
        willUpdateDefault: true,
        willUpdateActive: true,
        blocked: false,
        issues: [],
      },
    ],
  };

  it('shows the target title next to its id and keeps the draft when backup opens', () => {
    const onOpenBackup = vi.fn<() => void>();
    render(<MigrationPage {...pageProps({ preview, onOpenBackup })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Review and apply' }));

    const dialog = screen.getByRole('dialog', { name: 'Review migration' });
    expect(dialog).toHaveTextContent('Solo Leveling (Official) (target-1)');

    fireEvent.click(screen.getByRole('button', { name: 'Open backup' }));
    expect(onOpenBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Review migration' })).toBeInTheDocument();
  });
});
