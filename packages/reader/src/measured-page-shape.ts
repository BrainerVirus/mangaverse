import type { ReaderPageData } from './reader-page-data.js';
import { shouldResolveAutoToStrip } from './resolve-reader-settings.js';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';
import type { ReaderPage } from './types.js';

/** A page's natural size, reported once its image decodes. */
export interface ReaderPageMeasurement {
  readonly pageIndex: number;
  readonly width: number;
  readonly height: number;
}

/** Whether a measurement is a size worth storing: positive whole pixels. */
export function isUsableMeasurement(measurement: ReaderPageMeasurement): boolean {
  return (
    Number.isInteger(measurement.width) &&
    Number.isInteger(measurement.height) &&
    measurement.width > 0 &&
    measurement.height > 0
  );
}

/** Whether the page already carries exactly this shape. */
export function pageHasSize(page: ReaderPage, measurement: ReaderPageMeasurement): boolean {
  return page.image.width === measurement.width && page.image.height === measurement.height;
}

function withSize(page: ReaderPage, measurement: ReaderPageMeasurement): ReaderPage {
  return {
    ...page,
    width: measurement.width,
    height: measurement.height,
    image: { ...page.image, width: measurement.width, height: measurement.height },
  };
}

/**
 * The reader data to show once a page decodes, when that decode switches Auto
 * to the strip (spec R6): the measured shape is merged into the page and the
 * settings resolve again. `undefined` when the reader stays as it is: it is
 * already a strip, the page is not this chapter's, or the shape or a concrete
 * title mode keeps it paged. Nothing here is a saved setting.
 */
export function resolveAutoStripSwitch(
  data: ReaderPageData,
  measurement: ReaderPageMeasurement,
): ReaderPageData | undefined {
  if (data.engineSettings.readingMode === 'vertical' || !isUsableMeasurement(measurement)) {
    return undefined;
  }
  const position = data.chapter.pages.findIndex((page) => page.index === measurement.pageIndex);
  const page = data.chapter.pages[position];
  if (page === undefined) return undefined;
  const measured = withSize(page, measurement);
  if (
    !shouldResolveAutoToStrip({
      settings: data.settings,
      titleOverrides: data.titleOverrides,
      page: measured,
    })
  ) {
    return undefined;
  }
  const pages = data.chapter.pages.map((item, index) => (index === position ? measured : item));
  const engineSettings = toReaderEngineSettings(data.settings, {
    globalSettings: data.globalSettings,
    titleOverrides: data.titleOverrides,
    tags: data.titleTags,
    pages,
  });
  // Stored shapes of other pages still vote: one tall page in a chapter
  // already known to be paged does not switch it.
  if (engineSettings.readingMode !== 'vertical') return undefined;
  return { ...data, chapter: { ...data.chapter, pages }, engineSettings };
}
