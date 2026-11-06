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

function ModeProbe({ data }: { readonly data: ReaderPageData }) {
  const { readerState } = useReaderSession(data, VIEWPORT);
  return <span data-testid="mode">{readerState?.settings.readingMode ?? 'none'}</span>;
}

describe('useReaderSession auto mode', () => {
  it('Given a title Auto over a concrete global RTL, When the session builds, Then it reads RTL', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const base = buildData(3, 0);
    const globalSettings = { ...getDefaultReaderSettings(), readingMode: 'rtl' as const };
    const data: ReaderPageData = {
      ...base,
      globalSettings,
      settings: { ...globalSettings, readingMode: 'auto' },
      titleOverrides: { readingMode: 'auto' },
    };
    act(() => {
      root.render(<ModeProbe data={data} />);
    });
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe('rtl');

    act(() => root.unmount());
    container.remove();
  });
});

function LayoutProbe({
  data,
  viewport,
}: {
  readonly data: ReaderPageData;
  readonly viewport: { width: number; height: number; orientation: 'portrait' | 'landscape' };
}) {
  const { readerState } = useReaderSession(data, viewport);
  return (
    <span data-testid="layout" data-mode={readerState?.mode}>
      {readerState?.layout}
    </span>
  );
}

describe('useReaderSession Auto resolution', () => {
  it('Given Auto layout, When the viewport turns landscape, Then the session shows spreads on the same page', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const data = buildData(10, 3);

    act(() => root.render(<LayoutProbe data={data} viewport={VIEWPORT} />));
    expect(container.querySelector('[data-testid="layout"]')?.textContent).toBe('single');

    act(() =>
      root.render(
        <LayoutProbe
          data={data}
          viewport={{ width: 1200, height: 800, orientation: 'landscape' }}
        />,
      ),
    );
    expect(container.querySelector('[data-testid="layout"]')?.textContent).toBe('double');

    act(() => root.unmount());
    container.remove();
  });

  it('Given Auto mode and long strip tags, When the session builds, Then it is a scroll session', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() =>
      root.render(
        <LayoutProbe
          data={{ ...buildData(10, 0), titleTags: ['Long Strip'] }}
          viewport={VIEWPORT}
        />,
      ),
    );
    expect(container.querySelector<HTMLElement>('[data-testid="layout"]')?.dataset.mode).toBe(
      'scroll',
    );

    act(() => root.unmount());
    container.remove();
  });
});

function FitProbe({ data }: { readonly data: ReaderPageData }) {
  const { readerState } = useReaderSession(data, VIEWPORT);
  return (
    <span data-testid="fit" data-mode={readerState?.settings.readingMode}>
      {readerState?.settings.fitMode}
    </span>
  );
}

describe('useReaderSession retained strip decision', () => {
  it('Given a strip decision over a concrete global RTL, When the session builds, Then it is the strip, fit-width for an Auto fit and the saved fit otherwise', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const globalSettings = { ...getDefaultReaderSettings(), readingMode: 'rtl' as const };
    const fit = () => container.querySelector<HTMLElement>('[data-testid="fit"]');

    for (const [fitMode, expected] of [
      ['auto', 'width'],
      ['contain', 'contain'],
      ['cover', 'cover'],
    ] as const) {
      const data: ReaderPageData = {
        ...buildData(3, 0),
        globalSettings,
        settings: { ...globalSettings, fitMode },
        autoStripDecision: 'strip',
      };
      act(() => root.render(<FitProbe data={data} />));
      expect(fit()?.dataset.mode).toBe('vertical');
      expect(fit()?.textContent).toBe(expected);
    }

    act(() => root.unmount());
    container.remove();
  });
});
