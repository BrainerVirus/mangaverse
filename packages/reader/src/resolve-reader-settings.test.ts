import { describe, expect, it } from 'vitest';
import { getDefaultReaderSettings, toChapterPageId, type ReaderSettings } from '@app/shared';
import {
  hasLongStripTag,
  isClearlyLongStrip,
  resolveReaderPresentation,
  shouldResolveAutoToStrip,
} from './resolve-reader-settings.js';
import type { ReaderPage } from './types.js';

function page(index: number, width?: number, height?: number): ReaderPage {
  return {
    id: toChapterPageId(`p-${index}`),
    index,
    image: {
      url: `https://x/${index}.jpg`,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    },
  };
}

const STRIP_PAGES = [page(0, 800, 4000), page(1, 800, 3600), page(2, 800, 5000)];
const PAGED_PAGES = [page(0, 800, 1200), page(1, 800, 1200), page(2, 800, 1200)];
const auto = getDefaultReaderSettings();

function settingsWith(patch: Partial<ReaderSettings>): ReaderSettings {
  return { ...auto, ...patch };
}

describe('resolveReaderPresentation (R6 rule order)', () => {
  it('Rule 1: Given a concrete title mode, When pages and tags say strip, Then the title choice wins', () => {
    const result = resolveReaderPresentation({
      settings: settingsWith({ readingMode: 'rtl' }),
      titleOverrides: { readingMode: 'rtl' },
      pages: STRIP_PAGES,
      tags: ['Long Strip'],
    });

    expect(result).toMatchObject({ readingMode: 'rtl', readingModeSource: 'title' });
  });

  it('Rule 1: Given a title choice of Auto, When resolving, Then inference still runs', () => {
    const result = resolveReaderPresentation({
      settings: auto,
      titleOverrides: { readingMode: 'auto' },
      pages: STRIP_PAGES,
    });

    expect(result.readingModeSource).toBe('pageShape');
  });

  it('Rule 2: Given clearly long-strip pages and paged metadata, When resolving, Then page shape decides', () => {
    const result = resolveReaderPresentation({
      settings: auto,
      pages: STRIP_PAGES,
      tags: ['Action', 'Full Color'],
    });

    expect(result).toMatchObject({
      readingMode: 'vertical',
      readingModeSource: 'pageShape',
      fitMode: 'width',
    });
  });

  it('Rule 2: Given a global concrete paged mode, When pages are clearly a strip, Then page shape still decides', () => {
    const result = resolveReaderPresentation({
      settings: settingsWith({ readingMode: 'ltr' }),
      pages: STRIP_PAGES,
    });

    expect(result).toMatchObject({ readingMode: 'vertical', readingModeSource: 'pageShape' });
  });

  it('Rule 3: Given no stored shapes and a long strip tag, When resolving, Then metadata decides', () => {
    const result = resolveReaderPresentation({
      settings: auto,
      pages: [page(0), page(1)],
      tags: ['  WEBTOON '],
    });

    expect(result).toMatchObject({ readingMode: 'vertical', readingModeSource: 'metadata' });
  });

  it('Rule 4: Given no strip signal, When the global mode is concrete, Then it applies', () => {
    const result = resolveReaderPresentation({
      settings: settingsWith({ readingMode: 'rtl' }),
      pages: PAGED_PAGES,
      tags: ['Action'],
    });

    expect(result).toMatchObject({ readingMode: 'rtl', readingModeSource: 'global' });
  });

  it('Rule 4: Given a title Auto over a concrete global mode, When resolving, Then the global mode still applies', () => {
    const result = resolveReaderPresentation({
      // The merged row held Auto because the title saved Auto over RTL.
      settings: settingsWith({ readingMode: 'auto' }),
      globalSettings: settingsWith({ readingMode: 'rtl' }),
      titleOverrides: { readingMode: 'auto' },
      pages: PAGED_PAGES,
      tags: ['Action'],
    });

    expect(result).toMatchObject({ readingMode: 'rtl', readingModeSource: 'global' });
  });

  it('Rule 5: Given Auto everywhere and no signal, When resolving, Then the reader is paged LTR fit to screen', () => {
    const result = resolveReaderPresentation({ settings: auto, pages: PAGED_PAGES });

    expect(result).toEqual({
      readingMode: 'ltr',
      readingModeSource: 'fallback',
      pageLayout: 'single',
      fitMode: 'contain',
    });
  });

  it('Given Auto layout, When the viewport is landscape or portrait, Then spreads or single pages show', () => {
    expect(
      resolveReaderPresentation({ settings: auto, viewport: { orientation: 'landscape' } })
        .pageLayout,
    ).toBe('double');
    expect(
      resolveReaderPresentation({ settings: auto, viewport: { orientation: 'portrait' } })
        .pageLayout,
    ).toBe('single');
    expect(
      resolveReaderPresentation({
        settings: settingsWith({ pageLayout: 'smartSpread' }),
        viewport: { orientation: 'portrait' },
      }).pageLayout,
    ).toBe('smartSpread');
  });

  it('Given a concrete fit, When resolving in either mode, Then the fit is kept', () => {
    expect(
      resolveReaderPresentation({
        settings: settingsWith({ fitMode: 'height' }),
        pages: STRIP_PAGES,
      }).fitMode,
    ).toBe('height');
  });
});

describe('long strip signals', () => {
  it('Given one tall credits page in a paged chapter, When judging shape, Then it is not a strip', () => {
    expect(isClearlyLongStrip([...PAGED_PAGES, page(3, 800, 4000)])).toBe(false);
    expect(isClearlyLongStrip([page(0), page(1)])).toBe(false);
    expect(isClearlyLongStrip([page(0, 800, 2400), page(1)])).toBe(true);
  });

  it('Given tag spellings, When matching, Then case and separators are ignored but web comic is not a strip', () => {
    expect(hasLongStripTag(['long-strip'])).toBe(true);
    expect(hasLongStripTag(['Long_Strip'])).toBe(true);
    expect(hasLongStripTag(['Webtoons'])).toBe(true);
    expect(hasLongStripTag(['Web Comic', 'Manhwa'])).toBe(false);
  });
});

describe('shouldResolveAutoToStrip (first decode under Auto)', () => {
  const STRIP = page(0, 800, 6000);

  it('Given Auto and a long-strip page, When it decodes, Then Auto resolves to the strip', () => {
    expect(shouldResolveAutoToStrip({ settings: auto, page: STRIP })).toBe(true);
  });

  it('Given Auto and an ordinary page, When it decodes, Then the reader stays paged', () => {
    expect(shouldResolveAutoToStrip({ settings: auto, page: page(0, 800, 1200) })).toBe(false);
  });

  it('Given a concrete title mode, When a long-strip page decodes, Then the title choice holds', () => {
    for (const readingMode of ['ltr', 'rtl', 'vertical'] as const) {
      expect(
        shouldResolveAutoToStrip({
          settings: settingsWith({ readingMode }),
          titleOverrides: { readingMode },
          page: STRIP,
        }),
      ).toBe(false);
    }
  });

  it('Given a title Auto over a global RTL, When a long-strip page decodes, Then Auto resolves to the strip', () => {
    expect(
      shouldResolveAutoToStrip({
        settings: settingsWith({ readingMode: 'auto' }),
        titleOverrides: { readingMode: 'auto' },
        page: STRIP,
      }),
    ).toBe(true);
  });

  it('Given a global concrete mode and no title choice, When a long-strip page decodes, Then page shape still decides, as on a later open', () => {
    const settings = settingsWith({ readingMode: 'rtl' });
    expect(shouldResolveAutoToStrip({ settings, page: STRIP })).toBe(true);
    expect(resolveReaderPresentation({ settings, pages: [STRIP] }).readingMode).toBe('vertical');
  });

  it('Given a page with no size, When judging it, Then nothing switches', () => {
    expect(shouldResolveAutoToStrip({ settings: auto, page: page(0) })).toBe(false);
  });
});
