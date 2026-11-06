// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { getDefaultReaderSettings, toChapterPageId, type ReaderSettings } from '@app/shared';
import type { CoverCacheContextValue } from '@app/cache';

const plans = vi.hoisted(() => [] as { pageIndex: number }[][]);
const pools = vi.hoisted(() => [] as { maxDisplayEdge?: number | undefined }[]);

vi.mock('@app/cache', () => ({
  createPageDecodePool: (input: { maxDisplayEdge?: number | undefined }) => {
    pools.push(input);
    return {
      setPlan: (plan: { pageIndex: number }[]) => plans.push(plan),
      dispose: () => {},
    };
  },
}));

import { useDecodeAhead } from './use-decode-ahead.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

function buildData(overrides: Partial<ReaderSettings>): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...overrides };
  const pages = Array.from({ length: 8 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg` },
  }));
  return {
    chapter: { id: 'chapter-1', mangaId: 'manga-1', title: 'Chapter 1', pages, pageCount: 8 },
    mangaId: 'manga-1' as ReaderPageData['mangaId'],
    chapterId: 'chapter-1' as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex: 0,
    settings,
    engineSettings: toReaderEngineSettings(settings),
  };
}

const context = {
  db: {} as CoverCacheContextValue['db'],
  adapter: {} as CoverCacheContextValue['adapter'],
  cacheLimitBytes: 1024,
};

function Probe({ data }: { readonly data: ReaderPageData }) {
  useDecodeAhead({ data, cacheContext: context, activePageIndex: 5 });
  return null;
}

describe('useDecodeAhead', () => {
  it('Given preloadBehind, When the decode plan is built, Then it reaches that many pages behind', () => {
    const decoded = (preloadBehind: number) => {
      plans.length = 0;
      const root = createRoot(document.createElement('div'));
      act(() => root.render(<Probe data={buildData({ preloadAhead: 1, preloadBehind })} />));
      act(() => root.unmount());
      return plans.at(-1)?.map((item) => item.pageIndex);
    };

    expect(decoded(2)).toEqual([5, 4, 6, 3]);
    expect(decoded(0)).toEqual([5, 6]);
  });

  it('Given Auto or Off display downscale, When the pool is built, Then it warms the URL the page images mount', () => {
    const cap = (settings: Partial<ReaderSettings>) => {
      pools.length = 0;
      const root = createRoot(document.createElement('div'));
      act(() => root.render(<Probe data={buildData(settings)} />));
      act(() => root.unmount());
      return pools.at(-1)?.maxDisplayEdge;
    };

    expect(cap({})).toBe(2048);
    expect(cap({ displayDownscale: 'off' })).toBeUndefined();
  });

  it('Given data saver, When the decode plan is built, Then it is empty even with look-ahead configured', () => {
    plans.length = 0;
    const root = createRoot(document.createElement('div'));
    act(() =>
      root.render(
        <Probe data={buildData({ preloadAhead: 6, preloadBehind: 3, dataSaver: true })} />,
      ),
    );
    act(() => root.unmount());

    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((plan) => plan.length === 0)).toBe(true);
  });
});
