import type { FitMode, ReaderSettings, ReaderSettingsOverride } from '@app/shared';
import { isLongStripPage } from './scroll-layout.js';
import type { ReaderPage, ReaderViewport } from './types.js';

export type ResolvedReadingMode = 'rtl' | 'ltr' | 'vertical';
type ResolvedPageLayout = 'single' | 'double' | 'smartSpread';
export type ResolvedFitMode = Exclude<FitMode, 'auto'>;

/** Which rule picked the reading mode, in the order R6 applies them. */
type ReadingModeSource = 'title' | 'pageShape' | 'metadata' | 'global' | 'fallback';

export interface ReaderPresentationInput {
  /** The global settings with the title's choices applied; may hold `auto`. */
  readonly settings: ReaderSettings;
  /** The title's own choices: a concrete value here beats every inference. */
  readonly titleOverrides?: ReaderSettingsOverride | undefined;
  /** Stored page shapes, when the provider or a measurement recorded them. */
  readonly pages?: readonly ReaderPage[] | undefined;
  /** The title's tag labels from its stored manga identity. */
  readonly tags?: readonly string[] | undefined;
  /** Without one, Auto layout reads as portrait. */
  readonly viewport?: Pick<ReaderViewport, 'orientation'> | undefined;
}

export interface ReaderPresentation {
  readonly readingMode: ResolvedReadingMode;
  readonly readingModeSource: ReadingModeSource;
  readonly pageLayout: ResolvedPageLayout;
  readonly fitMode: ResolvedFitMode;
}

/**
 * Normalized tag labels that mean the title is drawn as one vertical strip.
 * "Web comic" is deliberately absent: on MangaDex it names where a work was
 * published, and plenty of web comics are ordinary pages. "Manhwa" is absent
 * for the same reason: older manhwa are paged.
 */
const LONG_STRIP_TAGS: ReadonlySet<string> = new Set([
  'long strip',
  'longstrip',
  'webtoon',
  'webtoons',
]);

function normalizeTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/g, ' ');
}

/** Whether a title's metadata names it a long strip. */
export function hasLongStripTag(tags: readonly string[]): boolean {
  return tags.some((tag) => LONG_STRIP_TAGS.has(normalizeTag(tag)));
}

/**
 * Whether the stored page shapes clearly describe a long strip: more than half
 * of the pages with a known shape are at least three times taller than wide
 * (`LONG_STRIP_ASPECT_RATIO`). One tall credits page in a paged chapter stays
 * paged; pages with no stored shape do not vote.
 */
export function isClearlyLongStrip(pages: readonly ReaderPage[]): boolean {
  let known = 0;
  let long = 0;
  for (const page of pages) {
    const width = page.image.width ?? page.width;
    const height = page.image.height ?? page.height;
    if (width === undefined || height === undefined || width <= 0 || height <= 0) continue;
    known += 1;
    if (isLongStripPage(page)) long += 1;
  }
  return known > 0 && long * 2 > known;
}

function resolveReadingMode(
  input: ReaderPresentationInput,
): Pick<ReaderPresentation, 'readingMode' | 'readingModeSource'> {
  const titleMode = input.titleOverrides?.readingMode;
  if (titleMode !== undefined && titleMode !== 'auto') {
    return { readingMode: titleMode, readingModeSource: 'title' };
  }
  if (isClearlyLongStrip(input.pages ?? [])) {
    return { readingMode: 'vertical', readingModeSource: 'pageShape' };
  }
  if (hasLongStripTag(input.tags ?? [])) {
    return { readingMode: 'vertical', readingModeSource: 'metadata' };
  }
  const mode = input.settings.readingMode;
  if (mode !== 'auto') return { readingMode: mode, readingModeSource: 'global' };
  return { readingMode: 'ltr', readingModeSource: 'fallback' };
}

/**
 * Turns the saved settings into what the reader shows (spec R6). Reading mode:
 * an explicit title choice, then page shape when clearly a long strip, then
 * provider tags, then the global choice, then paged left-to-right. Auto layout
 * is spreads in landscape and single in portrait; Auto fit is fit-to-screen
 * when paged and fit-width in a strip.
 */
export function resolveReaderPresentation(input: ReaderPresentationInput): ReaderPresentation {
  const mode = resolveReadingMode(input);
  const strip = mode.readingMode === 'vertical';
  const layout = input.settings.pageLayout;
  const pageLayout: ResolvedPageLayout =
    layout !== 'auto' ? layout : input.viewport?.orientation === 'landscape' ? 'double' : 'single';
  const fit = input.settings.fitMode;
  const fitMode: ResolvedFitMode = fit !== 'auto' ? fit : strip ? 'width' : 'contain';
  return { ...mode, pageLayout, fitMode };
}
