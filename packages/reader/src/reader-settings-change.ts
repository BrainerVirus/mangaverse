import type { ReaderSettings, ReaderSettingsOverride } from '@app/shared';
import type { ReaderPageData } from './reader-page-data.js';
import type { ResolvedReadingMode } from './resolve-reader-settings.js';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';
import type { ReaderSettingsScope } from './types.js';

type PagedDirection = Exclude<ResolvedReadingMode, 'vertical'>;

function isPagedDirection(mode: ReaderSettings['readingMode'] | undefined): mode is PagedDirection {
  return mode === 'rtl' || mode === 'ltr';
}

/**
 * Choosing a concrete page layout while the strip is showing asks for paged
 * reading, so the change also needs a paged direction. It is the direction the
 * reader last showed paged in this session, then the global row's paged
 * direction, then the merged settings' paged direction, then left-to-right only
 * when none exists. The direction is preserved rather than reset, and an Auto
 * layout leaves the strip alone. A change that names a reading mode itself is
 * left alone, so switching direction deliberately still works.
 */
export function withPagedDirectionOnLeavingStrip(
  patch: Partial<ReaderSettings>,
  input: {
    readonly shownMode: ResolvedReadingMode;
    readonly lastPagedDirection: PagedDirection | null;
    readonly globalSettings: ReaderSettings | undefined;
    /** The merged settings, when the caller has them: a saved paged direction. */
    readonly settings?: ReaderSettings | undefined;
  },
): Partial<ReaderSettings> {
  if (input.shownMode !== 'vertical') return patch;
  if (patch.pageLayout === undefined || patch.pageLayout === 'auto') return patch;
  if (patch.readingMode !== undefined) return patch;
  const globalMode = input.globalSettings?.readingMode;
  const mergedMode = input.settings?.readingMode;
  const readingMode =
    input.lastPagedDirection ??
    (isPagedDirection(globalMode) ? globalMode : isPagedDirection(mergedMode) ? mergedMode : 'ltr');
  return { ...patch, readingMode };
}

function withoutKeysOf(
  overrides: ReaderSettingsOverride,
  patch: Partial<ReaderSettings>,
): ReaderSettingsOverride {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => !(key in patch)));
}

/**
 * The reader data after a settings change, before it is saved (spec R7).
 * "This title" adds the change to the title's choices. "All titles" changes
 * the global row and drops the same keys from the title's choices, so the
 * open title shows the new default instead of an older title choice.
 */
export function applyReaderSettingsChange(
  data: ReaderPageData,
  patch: Partial<ReaderSettings>,
  scope: ReaderSettingsScope,
): ReaderPageData {
  const titleOverrides = data.titleOverrides ?? {};
  const settings = { ...data.settings, ...patch };
  const next =
    scope === 'title'
      ? { titleOverrides: { ...titleOverrides, ...patch } }
      : {
          titleOverrides: withoutKeysOf(titleOverrides, patch),
          ...(data.globalSettings !== undefined
            ? { globalSettings: { ...data.globalSettings, ...patch } }
            : {}),
        };
  return {
    ...data,
    ...next,
    settings,
    engineSettings: toReaderEngineSettings(settings, {
      globalSettings: next.globalSettings ?? data.globalSettings,
      titleOverrides: next.titleOverrides,
      tags: data.titleTags,
      pages: data.chapter.pages,
    }),
  };
}
