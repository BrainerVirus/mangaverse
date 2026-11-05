import { describe, expect, it } from 'vitest';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import {
  applyReaderSettingsChange,
  withPagedDirectionOnLeavingStrip,
} from './reader-settings-change.js';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';
import type { ReaderPageData } from './reader-page-data.js';

function buildData(): ReaderPageData {
  const globalSettings = { ...getDefaultReaderSettings(), readingMode: 'ltr' as const };
  const titleOverrides = { readingMode: 'rtl' as const, verticalGapPx: 16 };
  const settings = { ...globalSettings, ...titleOverrides };
  const pages = [{ id: toChapterPageId('p-0'), index: 0, image: { url: 'https://x/0.jpg' } }];
  return {
    chapter: { id: 'c', mangaId: 'm', title: 'C', pages, pageCount: 1 },
    mangaId: 'm' as ReaderPageData['mangaId'],
    chapterId: 'c' as ReaderPageData['chapterId'],
    providerId: 'p',
    initialPageIndex: 0,
    settings,
    globalSettings,
    titleOverrides,
    engineSettings: toReaderEngineSettings(settings, { titleOverrides }),
  };
}

describe('applyReaderSettingsChange', () => {
  it('Given This title, When a change applies, Then only the title choices and merged settings move', () => {
    const next = applyReaderSettingsChange(buildData(), { fitMode: 'height' }, 'title');

    expect(next.titleOverrides).toEqual({
      readingMode: 'rtl',
      verticalGapPx: 16,
      fitMode: 'height',
    });
    expect(next.globalSettings?.fitMode).toBe('auto');
    expect(next.settings.fitMode).toBe('height');
    expect(next.engineSettings.fitMode).toBe('height');
  });

  it('Given All titles, When a key the title also chose changes, Then the global row moves and the title choice is dropped', () => {
    const next = applyReaderSettingsChange(buildData(), { readingMode: 'vertical' }, 'global');

    expect(next.globalSettings?.readingMode).toBe('vertical');
    expect(next.titleOverrides).toEqual({ verticalGapPx: 16 });
    expect(next.settings.readingMode).toBe('vertical');
    expect(next.engineSettings.readingMode).toBe('vertical');
  });
});

describe('withPagedDirectionOnLeavingStrip', () => {
  const global = { ...getDefaultReaderSettings(), readingMode: 'rtl' as const };

  it('prefers the session direction, then the global paged direction, then LTR', () => {
    const patch = { pageLayout: 'single' as const };
    expect(
      withPagedDirectionOnLeavingStrip(patch, {
        shownMode: 'vertical',
        lastPagedDirection: 'ltr',
        globalSettings: global,
      }).readingMode,
    ).toBe('ltr');
    expect(
      withPagedDirectionOnLeavingStrip(patch, {
        shownMode: 'vertical',
        lastPagedDirection: null,
        globalSettings: global,
      }).readingMode,
    ).toBe('rtl');
    expect(
      withPagedDirectionOnLeavingStrip(patch, {
        shownMode: 'vertical',
        lastPagedDirection: null,
        globalSettings: undefined,
      }).readingMode,
    ).toBe('ltr');
  });

  it('leaves paged reading and explicit directions alone', () => {
    expect(
      withPagedDirectionOnLeavingStrip(
        { pageLayout: 'double' },
        { shownMode: 'rtl', lastPagedDirection: null, globalSettings: global },
      ),
    ).toEqual({ pageLayout: 'double' });
    expect(
      withPagedDirectionOnLeavingStrip(
        { pageLayout: 'double', readingMode: 'auto' },
        { shownMode: 'vertical', lastPagedDirection: 'rtl', globalSettings: global },
      ),
    ).toEqual({ pageLayout: 'double', readingMode: 'auto' });
  });
});
