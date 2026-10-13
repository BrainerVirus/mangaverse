// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { getDefaultReaderSettings } from '@app/shared';

vi.mock('@app/cache', () => ({
  CachedPageImage: () => null,
  markChapterPagesAsRead: vi.fn(async () => {}),
  prefetchChapterPages: vi.fn(async () => {}),
  useCoverCacheContext: () => null,
}));

vi.mock('@app/design-system', () => ({
  Button: () => null,
  EmptyState: () => null,
  ErrorState: () => null,
  LoadingState: () => null,
  ReaderChrome: () => null,
  Sheet: () => null,
  SheetContent: () => null,
  SheetHeader: () => null,
  SheetTitle: () => null,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

import { ReaderScreen } from './ReaderScreen.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

function buildData(): ReaderPageData {
  const settings = getDefaultReaderSettings();
  const pages = Array.from({ length: 37 }, (_value, index) => ({
    id: `page-${index}`,
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
    initialPageIndex: 0,
    settings,
    engineSettings: toReaderEngineSettings(settings),
  };
}

function mount(onPersist: (event: { pageIndex: number }) => void): { root: Root; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReaderScreen
        data={buildData()}
        isLoading={false}
        isError={false}
        chromeVisible={true}
        onToggleChrome={() => {}}
        onPersistProgress={onPersist}
      />,
    );
  });
  return { root, container };
}

describe('ReaderScreen progress checkpoint', () => {
  it('Given a reader that mounted and left immediately, When unmounting, Then the initial page is not persisted', () => {
    const onPersist = vi.fn();
    const { root, container } = mount(onPersist);

    // A router blip (or a user pressing Back right after opening) must not
    // persist its initial page over newer progress from another instance.
    act(() => {
      root.unmount();
    });
    container.remove();

    expect(onPersist).not.toHaveBeenCalled();
  });

  it('Given the reader advanced a page, When unmounting before the debounce, Then the new page is checkpointed', () => {
    const onPersist = vi.fn();
    const { root, container } = mount(onPersist);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    act(() => {
      root.unmount();
    });
    container.remove();

    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0]?.[0]).toMatchObject({ pageIndex: 1 });
  });
});
