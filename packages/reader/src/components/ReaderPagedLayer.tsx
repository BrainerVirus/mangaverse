/* oxlint-disable shadcn/no-inline-styles -- the zoom transform and fitted page box are per-frame numeric values; they cannot be expressed as static classes. */
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CachedPageImage, type CoverCacheContextValue } from '@app/cache';
import { resolvePageFit, type PageFitInput } from '../page-fit.js';
import type { ReaderPageData } from '../reader-page-data.js';
import type { ReaderPage, ReaderState } from '../types.js';

const OBJECT_FIT_CLASS = {
  contain: 'object-contain',
  cover: 'object-cover',
  none: 'object-none',
} as const;

export interface ReaderPagedLayerProps {
  readonly readerState: ReaderState;
  readonly visiblePages: readonly ReaderPage[];
  readonly data: ReaderPageData;
  readonly fitInput: PageFitInput;
  readonly cacheContext: CoverCacheContextValue | null;
  readonly imageSmoothing: boolean;
  readonly setPagedLayer: (node: HTMLDivElement | null) => void;
  readonly setPageTransitionLayer: (node: HTMLDivElement | null) => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onSkip: () => void;
  readonly onBack: (() => void) | undefined;
  readonly onPageMetric: (metric: {
    pageIndex: number;
    status: 'loaded' | 'failed';
    fromCache: boolean;
    durationMs: number;
  }) => void;
}

/** The paged reading layer: fixed-fit boxes inside the pan/zoom transform. */
export function ReaderPagedLayer({
  readerState,
  visiblePages,
  data,
  fitInput,
  cacheContext,
  imageSmoothing,
  setPagedLayer,
  setPageTransitionLayer,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSkip,
  onBack,
  onPageMetric,
}: ReaderPagedLayerProps) {
  return (
    <div
      ref={setPagedLayer}
      className="reader-page-scroll absolute inset-0 flex overflow-auto"
      data-testid="reader-zoom-layer"
      data-page-transition={data.engineSettings.pageTransition ?? 'none'}
      style={{
        transform: `translate(${readerState.zoom.translateX}px, ${readerState.zoom.translateY}px) scale(${readerState.zoom.scale})`,
        transformOrigin: 'top left',
        touchAction: readerState.zoom.scale > 1 ? 'none' : 'pan-x pan-y',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/*
        GSAP animates this inner layer only. The zoom transform above is React's
        inline style; letting a transition tween share that element would make
        its revert restore a stale transform after a zoom or mode change.
      */}
      <div
        ref={setPageTransitionLayer}
        data-testid="reader-page-transition-layer"
        className="flex w-max shrink-0"
      >
        {visiblePages.map((page) => (
          <ReaderPageBox
            key={page.id}
            page={page}
            data={data}
            fitInput={fitInput}
            cacheContext={cacheContext}
            imageSmoothing={imageSmoothing}
            onPageMetric={onPageMetric}
            onSkip={onSkip}
            onBack={onBack}
          />
        ))}
      </div>
    </div>
  );
}

function resolveNaturalSize(
  page: ReaderPage | undefined,
): { readonly width: number; readonly height: number } | undefined {
  const width = page?.image.width ?? page?.width;
  const height = page?.image.height ?? page?.height;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return undefined;
  return { width, height };
}

/**
 * One fitted page box. Without a cache context there is nothing to read from
 * yet, so the box keeps its size and pulses instead of collapsing.
 */
function ReaderPageBox({
  page,
  data,
  fitInput,
  cacheContext,
  imageSmoothing,
  onPageMetric,
  onSkip,
  onBack,
}: {
  readonly page: ReaderPage;
  readonly data: ReaderPageData;
  readonly fitInput: PageFitInput;
  readonly cacheContext: CoverCacheContextValue | null;
  readonly imageSmoothing: boolean;
  readonly onPageMetric: ReaderPagedLayerProps['onPageMetric'];
  readonly onSkip: () => void;
  readonly onBack: (() => void) | undefined;
}) {
  const [natural, setNatural] = useState<{ width: number; height: number } | undefined>(undefined);
  const fit = resolvePageFit({ ...fitInput, naturalSize: resolveNaturalSize(page) ?? natural });
  if (cacheContext === null) {
    return (
      <div
        data-testid="reader-page-box"
        data-fit-mode={data.engineSettings.fitMode}
        data-object-fit={fit.objectFit}
        style={{ width: `${fit.box.width}px`, height: `${fit.box.height}px`, flex: '0 0 auto' }}
        className="animate-pulse bg-muted/80"
        aria-hidden
      />
    );
  }

  return (
    <div
      data-testid="reader-page-box"
      data-fit-mode={data.engineSettings.fitMode}
      data-object-fit={fit.objectFit}
      style={{
        width: `${fit.box.width}px`,
        height: `${fit.box.height}px`,
        flex: '0 0 auto',
        overflow: 'hidden',
      }}
    >
      <CachedPageImage
        providerId={data.providerId}
        mangaId={data.mangaId}
        chapterId={data.chapterId}
        pageIndex={page.index}
        remoteUrl={page.image.url}
        className={`h-full w-full select-none ${OBJECT_FIT_CLASS[fit.objectFit]}`}
        retention="read"
        imageRendering={imageSmoothing ? 'auto' : 'pixelated'}
        onLoad={setNatural}
        onMetric={(metric) => onPageMetric({ pageIndex: page.index, ...metric })}
        onSkip={onSkip}
        onBack={onBack}
      />
    </div>
  );
}
