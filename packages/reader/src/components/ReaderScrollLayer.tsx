import type { CoverCacheContextValue } from '@app/cache';
import { ReaderScrollView, type ReaderScrollViewHandle } from './ReaderScrollView.js';
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
  readonly onPageMetric: (metric: {
    pageIndex: number;
    status: 'loaded' | 'failed';
    fromCache: boolean;
    durationMs: number;
  }) => void;
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
  onPageMetric,
}: ReaderScrollLayerProps) {
  return (
    <ReaderScrollView
      pages={data.chapter.pages}
      gapPx={data.engineSettings.verticalGapPx}
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
      imageSmoothing={data.engineSettings.imageSmoothing !== false}
      onPageMetric={onPageMetric}
      onBack={onBack}
      onHandle={onHandle}
    />
  );
}
