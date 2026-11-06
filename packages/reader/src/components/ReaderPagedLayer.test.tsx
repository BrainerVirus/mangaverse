// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { CachedPageImageProps, CoverCacheContextValue } from '@app/cache';
import { getDefaultReaderSettings, toChapterPageId, type ReaderSettings } from '@app/shared';

const rendered: CachedPageImageProps[] = [];

vi.mock('@app/cache', () => ({
  CachedPageImage: (props: CachedPageImageProps) => {
    rendered.push(props);
    return <img alt={`Page ${props.pageIndex + 1}`} className={props.className} />;
  },
}));

import { ReaderPagedLayer } from './ReaderPagedLayer.js';
import type { PageFitInput } from '../page-fit.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { createReaderState } from '../state.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';

const CACHE = {} as CoverCacheContextValue;

// Fit width over 800px: the 1600x1000 page is an 800x500 box.
const FIT_INPUT: PageFitInput = {
  fitMode: 'width',
  availableWidth: 800,
  availableHeight: 456,
  pageCount: 1,
};

function buildData(overrides: Partial<ReaderSettings>): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...overrides };
  const pages = Array.from({ length: 3 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: {
      url: `https://example.com/${index}.jpg`,
      ...(index === 1 ? { width: 1600, height: 1000 } : { width: 800, height: 1200 }),
    },
  }));
  return {
    chapter: { id: 'chapter-1', mangaId: 'manga-1', title: 'Chapter 1', pages, pageCount: 3 },
    mangaId: 'manga-1' as ReaderPageData['mangaId'],
    chapterId: 'chapter-1' as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex: 1,
    settings,
    engineSettings: toReaderEngineSettings(settings),
  };
}

let mounted: { root: Root; container: HTMLElement } | undefined;

function mount(
  overrides: Partial<ReaderSettings>,
  onPageMetric: Parameters<typeof ReaderPagedLayer>[0]['onPageMetric'] = () => {},
): HTMLElement {
  rendered.length = 0;
  const data = buildData({ pageLayout: 'double', readingMode: 'rtl', ...overrides });
  const readerState = createReaderState({
    chapter: data.chapter,
    viewport: { width: 800, height: 600, orientation: 'landscape' },
    settings: data.engineSettings,
    initialPageIndex: 1,
  });
  const visiblePages = readerState.visiblePageIndexes.map((index) => data.chapter.pages[index]!);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReaderPagedLayer
        readerState={readerState}
        visiblePages={visiblePages}
        data={data}
        fitInput={FIT_INPUT}
        cacheContext={CACHE}
        imageSmoothing
        setPagedLayer={() => {}}
        setPageTransitionLayer={() => {}}
        onPointerDown={() => {}}
        onPointerMove={() => {}}
        onPointerUp={() => {}}
        onSkip={() => {}}
        onBack={undefined}
        onPageMetric={onPageMetric}
      />,
    );
  });
  mounted = { root, container };
  return container;
}

afterEach(() => {
  if (mounted === undefined) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
});

function boxes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="reader-page-box"]')];
}

function announcedImages(container: HTMLElement): HTMLImageElement[] {
  return [...container.querySelectorAll('img')].filter(
    (image) => image.closest('[aria-hidden="true"]') === null,
  );
}

describe('ReaderPagedLayer display downscale', () => {
  it('Given Auto or Off, When pages render, Then each page image gets the resolved cap', () => {
    mount({});
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((props) => props.maxDisplayEdge === 2048)).toBe(true);

    act(() => mounted!.root.unmount());
    mounted!.container.remove();
    mounted = undefined;

    mount({ displayDownscale: 'off' });
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((props) => props.maxDisplayEdge === undefined)).toBe(true);
  });
});

describe('ReaderPagedLayer wide pages', () => {
  it('Given split, When a wide page is shown alone, Then it renders two clipped halves of the full image', () => {
    const container = mount({ widePageMode: 'split' });

    const [left, right] = boxes(container);
    expect(boxes(container)).toHaveLength(2);
    for (const half of [left!, right!]) {
      expect(half.style.width).toBe('400px');
      expect(half.style.height).toBe('500px');
      expect(half.style.overflow).toBe('hidden');
    }
    // RTL does not swap the halves: the image's left half is on the left.
    expect([left!.dataset['split'], right!.dataset['split']]).toEqual(['left', 'right']);
    const images = container.querySelectorAll<HTMLElement>(
      '[data-testid="reader-page-half-image"]',
    );
    expect([...images].map((image) => image.style.transform)).toEqual(['', 'translateX(-400px)']);
    for (const image of images) {
      expect(image.style.width).toBe('800px');
      expect(image.style.height).toBe('500px');
    }
  });

  it('Given split, When the halves render, Then the page is announced, measured and reported once', async () => {
    const onPageMetric = vi.fn<Parameters<typeof ReaderPagedLayer>[0]['onPageMetric']>();
    const container = mount({ widePageMode: 'split' }, onPageMetric);

    expect(boxes(container)[1]!.getAttribute('aria-hidden')).toBe('true');
    expect(announcedImages(container).map((image) => image.alt)).toEqual(['Page 2']);
    expect(rendered.filter((props) => props.onLoad !== undefined)).toHaveLength(1);
    const reporters = rendered.filter((props) => props.onMetric !== undefined);
    // Both halves watch for failure; only the owning half reports the metric.
    expect(reporters).toHaveLength(2);

    await act(async () => {
      reporters[0]!.onMetric!({ status: 'loaded', durationMs: 5, fromCache: true, byteSize: 1 });
    });

    expect(onPageMetric).toHaveBeenCalledTimes(1);
    expect(onPageMetric).toHaveBeenCalledWith({
      pageIndex: 1,
      status: 'loaded',
      durationMs: 5,
      fromCache: true,
      byteSize: 1,
    });
  });

  it('Given split, When either half fails, Then one whole box keeps the same image mounted, and a successful retry restores the split', async () => {
    for (const reporterIndex of [0, 1]) {
      const container = mount({ widePageMode: 'split' });
      const reporters = rendered.filter((props) => props.onMetric !== undefined);
      const owner = rendered.find((props) => props.onLoad !== undefined)!;
      const imageNode = container.querySelector('img');

      await act(async () => {
        reporters[reporterIndex]!.onMetric!({
          status: 'failed',
          durationMs: 5,
          fromCache: false,
          byteSize: 0,
        });
      });

      expect(boxes(container)).toHaveLength(1);
      expect(boxes(container)[0]!.style.width).toBe('800px');
      // The image that failed stays mounted, so its Retry state survives the
      // layout change instead of being recreated by a fresh lookup.
      expect(container.querySelector('img')).toBe(imageNode);

      await act(async () => {
        owner.onMetric!({
          status: 'loaded',
          durationMs: 6,
          fromCache: true,
          byteSize: 1,
        });
      });

      expect(boxes(container)).toHaveLength(2);
      expect(container.querySelector('img')).toBe(imageNode);
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted!.container.remove();
      mounted = undefined;
    }
  });

  it('Given isolate, When a wide page is shown alone, Then it renders one full box', () => {
    const container = mount({ widePageMode: 'isolate' });

    expect(boxes(container)).toHaveLength(1);
    expect(boxes(container)[0]!.style.width).toBe('800px');
    expect(boxes(container)[0]!.dataset['split']).toBeUndefined();
    expect(announcedImages(container)).toHaveLength(1);
  });

  it('Given split in single layout, When the wide page is shown, Then it is not split', () => {
    const container = mount({ widePageMode: 'split', pageLayout: 'single' });

    expect(boxes(container)).toHaveLength(1);
  });
});
