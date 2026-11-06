import { describe, expect, it } from 'vitest';
import { getDefaultReaderSettings, toChapterPageId, type ReaderSettings } from '@app/shared';
import { resolveAutoStripSwitch } from './measured-page-shape.js';
import type { ReaderPageData } from './reader-page-data.js';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';

function buildData(
  patch: Partial<ReaderSettings> = {},
  options: {
    readonly titleOverrides?: ReaderPageData['titleOverrides'];
    readonly storedPagedShapes?: boolean;
  } = {},
): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...patch };
  const pages = Array.from({ length: 4 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: {
      url: `https://example.com/${index}.png`,
      ...(options.storedPagedShapes === true && index > 0 ? { width: 800, height: 1200 } : {}),
    },
  }));
  const context = {
    titleOverrides: options.titleOverrides,
    pages,
  };
  return {
    chapter: { id: 'chapter-1', mangaId: 'manga-1', title: 'Chapter 1', pages, pageCount: 4 },
    mangaId: 'manga-1' as ReaderPageData['mangaId'],
    chapterId: 'chapter-1' as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex: 0,
    settings,
    ...(options.titleOverrides !== undefined ? { titleOverrides: options.titleOverrides } : {}),
    engineSettings: toReaderEngineSettings(settings, context),
  };
}

const TALL = { pageIndex: 0, width: 800, height: 6000 };

describe('resolveAutoStripSwitch', () => {
  it('Given Auto and no stored shapes, When the first page decodes as a long strip, Then the data carries the shape and resolves to the strip', () => {
    const data = buildData();
    expect(data.engineSettings.readingMode).toBe('ltr');

    const next = resolveAutoStripSwitch(data, TALL);

    expect(next?.engineSettings.readingMode).toBe('vertical');
    expect(next?.engineSettings.fitMode).toBe('width');
    expect(next?.chapter.pages[0]?.image).toMatchObject({ width: 800, height: 6000 });
    // No saved setting changes: this is Auto resolving, not a user choice.
    expect(next?.settings).toBe(data.settings);
    expect(next?.titleOverrides).toBe(data.titleOverrides);
    expect(next?.initialPageIndex).toBe(data.initialPageIndex);
  });

  it('Given an ordinary first page, When it decodes, Then nothing switches', () => {
    expect(resolveAutoStripSwitch(buildData(), { ...TALL, height: 1200 })).toBeUndefined();
  });

  it('Given a concrete title mode, When a long-strip page decodes, Then nothing switches', () => {
    const data = buildData({ readingMode: 'rtl' }, { titleOverrides: { readingMode: 'rtl' } });
    expect(resolveAutoStripSwitch(data, TALL)).toBeUndefined();
  });

  it('Given the reader is already a strip, When a page decodes, Then nothing switches again', () => {
    const data = buildData({}, { titleOverrides: { readingMode: 'vertical' } });
    expect(resolveAutoStripSwitch(data, TALL)).toBeUndefined();
    const switched = resolveAutoStripSwitch(buildData(), TALL)!;
    expect(resolveAutoStripSwitch(switched, { ...TALL, pageIndex: 1 })).toBeUndefined();
  });

  it('Given stored ordinary shapes for the other pages, When one tall page decodes, Then the chapter stays paged', () => {
    expect(
      resolveAutoStripSwitch(buildData({}, { storedPagedShapes: true }), TALL),
    ).toBeUndefined();
  });

  it('Given a page index the chapter does not have or an unusable size, When reported, Then nothing switches', () => {
    expect(resolveAutoStripSwitch(buildData(), { ...TALL, pageIndex: 9 })).toBeUndefined();
    expect(resolveAutoStripSwitch(buildData(), { ...TALL, width: 0 })).toBeUndefined();
  });
});
