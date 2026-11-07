import type { ReaderPageData } from './reader-page-data.js';
import { shouldResolveAutoToStrip } from './resolve-reader-settings.js';
import { toReaderEngineSettings, withAutoStripDecision } from './to-reader-engine-settings.js';
import type { ReaderPage } from './types.js';

/** The session's first-decode decision, kept across chapter refetches. */
type AutoStripDecision = 'strip' | 'paged' | null;

export interface PageShapeDecision {
  decision: AutoStripDecision;
  /** Sizes seen this session, so a refetch before the write lands keeps them. */
  readonly measurements: ReadonlyMap<number, ReaderPageMeasurement>;
}

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

/**
 * The reader data to present after a refetch: once the first decode chose the
 * strip, every later read of the same chapter keeps that choice, even if the
 * dimension write has not landed or stored ordinary pages would outvote it. A
 * concrete per-title mode ends the override (the user's choice wins).
 */
export function applyPageShapeDecision(
  data: ReaderPageData,
  decision: PageShapeDecision,
): ReaderPageData {
  if (decision.measurements.size === 0) return data;
  const pages = data.chapter.pages.map((page) => {
    const measurement = decision.measurements.get(page.index);
    return measurement === undefined ? page : withSize(page, measurement);
  });
  const titleMode = data.titleOverrides?.readingMode;
  if (decision.decision !== 'strip' || (titleMode !== undefined && titleMode !== 'auto')) {
    return { ...data, chapter: { ...data.chapter, pages } };
  }
  const engineSettings = toReaderEngineSettings(data.settings, {
    globalSettings: data.globalSettings,
    titleOverrides: data.titleOverrides,
    tags: data.titleTags,
    pages,
  });
  // A later majority of stored ordinary pages or a concrete global mode would
  // resolve paged; the field carries the decision to the session, which
  // resolves again with the viewport.
  return {
    ...data,
    chapter: { ...data.chapter, pages },
    engineSettings: withAutoStripDecision(engineSettings, data.settings.fitMode),
    autoStripDecision: 'strip',
  };
}
