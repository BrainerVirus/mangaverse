import type { CoverCacheContextValue } from '@app/cache';
import { READER_NEXT_CHAPTER_THRESHOLD_DEFAULT_PERCENT } from '@app/shared';
import { ReaderScrollView, type ReaderScrollViewHandle } from './ReaderScrollView.js';
import { STRIP_TILE_AUTO_THRESHOLD_PX } from '../scroll-layout.js';
import type { ReaderPageMeasurement } from '../measured-page-shape.js';
import type { ReaderPageData } from '../reader-page-data.js';
import type { ReaderState } from '../types.js';

export interface ReaderScrollLayerProps {
  readonly data: ReaderPageData;
  readonly readerState: ReaderState;
  readonly cacheContext: CoverCacheContextValue | null;
  readonly reducedMotion: boolean;
  readonly onActivePageChange: (index: number) => void;
  readonly onHandle: (handle: ReaderScrollViewHandle | null) => void;
  readonly onBack: (() => void) | undefined;
  /** Offers the chapter transition when the strip scrolls past its end threshold. */
  readonly onChapterEnd: (() => void) | undefined;
  readonly onPageMetric: (metric: {
    pageIndex: number;
    status: 'loaded' | 'failed';
    fromCache: boolean;
    durationMs: number;
  }) => void;
  readonly onPageMeasured?: ((measurement: ReaderPageMeasurement) => void) | undefined;
}

/** The continuous vertical strip, configured from the reader engine settings. */
export function ReaderScrollLayer({
  data,
  readerState,
  cacheContext,
  reducedMotion,
  onActivePageChange,
  onHandle,
  onBack,
  onChapterEnd,
  onPageMetric,
  onPageMeasured,
}: ReaderScrollLayerProps) {
  return (
    <ReaderScrollView
      // A new chapter starts a fresh strip: position, geometry and the threshold's armed state.
      key={data.chapterId}
      pages={data.chapter.pages}
      gapPx={data.engineSettings.verticalGapPx}
      maxWidthPercent={data.engineSettings.maxStripWidthPercent ?? 100}
      activePageIndex={readerState.activePageIndex}
      onActivePageChange={onActivePageChange}
      providerId={data.providerId}
      mangaId={data.mangaId}
      chapterId={data.chapterId}
      cacheReady={cacheContext !== null}
      reducedMotion={reducedMotion}
      preloadAhead={data.engineSettings.preloadAhead}
      lowMemoryMode={data.engineSettings.lowMemoryMode}
      longStripOptimization={data.engineSettings.longStripOptimization === true}
      tilingThresholdPx={data.engineSettings.tilingThresholdPx ?? STRIP_TILE_AUTO_THRESHOLD_PX}
      dataSaver={data.engineSettings.dataSaver === true}
      displayMaxEdgePx={data.engineSettings.displayMaxEdgePx}
      imageSmoothing={data.engineSettings.imageSmoothing !== false}
      onPageMetric={onPageMetric}
      onPageMeasured={onPageMeasured}
      onBack={onBack}
      nextChapterThresholdPercent={
        data.engineSettings.nextChapterThresholdPercent ??
        READER_NEXT_CHAPTER_THRESHOLD_DEFAULT_PERCENT
      }
      onChapterEnd={onChapterEnd}
      onHandle={onHandle}
    />
  );
}
