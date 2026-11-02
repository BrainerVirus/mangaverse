/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { StoragePage } from './StoragePage.js';
import type { StorageSummary } from '../types.js';

const capabilities = {
  runtime: 'web',
  storageEstimate: true,
  clipboardRead: false,
  clipboardWrite: false,
  nativeFileOpen: false,
  nativeFileSave: false,
  nativeFullscreen: false,
  protocolInstallHandoff: false,
  installPrompt: false,
  externalLinks: true,
  secureStorage: false,
  persistentStorage: false,
  diagnostics: false,
  localService: false,
  sqliteRuntime: false,
} as const;

const summary: StorageSummary = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  platformEstimate: null,
  cacheEntryCount: 4,
  cacheTotalBytes: 40,
  cacheEvictableBytes: 10,
  cacheByProvider: [{ providerId: 'mangadex', count: 4, bytes: 40 }],
  downloads: {
    count: 2,
    pageCount: 30,
    bytes: 30,
    items: [
      {
        chapterId: 'chapter-1',
        mangaId: 'manga-1',
        providerId: 'mangadex',
        status: 'complete',
        pageCount: 20,
        completedPages: 20,
        failedPages: 0,
        bytes: 20,
        title: 'Chapter 1',
        chapterIndex: 1,
        mangaTitle: 'A Title',
      },
      {
        chapterId: 'chapter-2',
        mangaId: 'manga-1',
        providerId: 'mangadex',
        status: 'partial',
        pageCount: 10,
        completedPages: 8,
        failedPages: 2,
        bytes: 10,
        title: 'Chapter 2',
        chapterIndex: 2,
      },
    ],
  },
  searchHistoryCount: 0,
  savedSearchCount: 0,
};

function renderPage(overrides: Partial<Parameters<typeof StoragePage>[0]> = {}) {
  const handlers = {
    onRefresh: vi.fn<() => void>(),
    onClear: vi.fn<() => void>(),
    onRequestPersistentStorage: vi.fn<() => void>(),
    onRetryDownload: vi.fn<() => void>(),
    onRemoveDownload: vi.fn<() => void>(),
    onDismissActionStatus: vi.fn<() => void>(),
  };
  render(
    <StoragePage
      isLoading={false}
      isError={false}
      summary={summary}
      capabilities={capabilities}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('StoragePage downloads', () => {
  it('lists downloads separately from the cache with size and status', () => {
    renderPage();

    expect(screen.getByText('Protected downloads')).toBeInTheDocument();
    expect(screen.getByText('Reclaimable cache')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.getByText('A Title · Downloaded · 20 B')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2')).toBeInTheDocument();
    expect(screen.getByText('Partial 8/10 · 10 B')).toBeInTheDocument();
    expect(screen.getByText('Downloaded chapters')).toBeInTheDocument();
  });

  it('retries a failed download and removes a complete one', () => {
    const handlers = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Retry download: Chapter 2' }));
    expect(handlers.onRetryDownload).toHaveBeenCalledWith('chapter-2');

    fireEvent.click(screen.getByRole('button', { name: 'Remove download: Chapter 1' }));
    expect(handlers.onRemoveDownload).toHaveBeenCalledWith('chapter-1');
    // A complete download has no retry control.
    expect(
      screen.queryByRole('button', { name: 'Retry download: Chapter 1' }),
    ).not.toBeInTheDocument();
  });

  it('says downloads are kept when the cache is cleared', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Clear provider cache' }));
    expect(screen.getByText(/Downloads are kept, along with your library/)).toBeInTheDocument();
  });
});
