// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import { useReaderSession } from './use-reader-session.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

const VIEWPORT = { width: 800, height: 600, orientation: 'portrait' } as const;

function buildData(pageCount: number, initialPageIndex: number): ReaderPageData {
  const settings = getDefaultReaderSettings();
  const pages = Array.from({ length: pageCount }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg` },
  }));
  return {
    chapter: {
      id: 'chapter-1',
      mangaId: 'manga-1',
      title: 'Chapter 1',
      pages,
      pageCount: pages.length,
    },
    mangaId: 'manga-1' as ReaderPageData['mangaId'],
    chapterId: 'chapter-1' as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex,
    settings,
    engineSettings: toReaderEngineSettings(settings),
  };
}

function Probe({ data }: { readonly data: ReaderPageData }) {
  const { readerState } = useReaderSession(data, VIEWPORT);
  return <span data-testid="index">{readerState?.activePageIndex ?? 'none'}</span>;
}

describe('useReaderSession provider page hydration', () => {
  it('Given a chapter that was empty while hydrating, When pages arrive, Then it resumes at the saved page', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Probe data={buildData(0, 0)} />);
    });
    expect(container.querySelector('[data-testid="index"]')?.textContent).toBe('0');

    act(() => {
      root.render(<Probe data={buildData(37, 4)} />);
    });
    expect(container.querySelector('[data-testid="index"]')?.textContent).toBe('4');

    act(() => root.unmount());
    container.remove();
  });

  it('Given a chapter with pages, When data refreshes for the same chapter, Then the current page is kept', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Probe data={buildData(37, 0)} />);
    });
    act(() => {
      root.render(<Probe data={buildData(37, 4)} />);
    });
    expect(container.querySelector('[data-testid="index"]')?.textContent).toBe('0');

    act(() => root.unmount());
    container.remove();
  });
});
