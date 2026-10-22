/* oxlint-disable shadcn/no-inline-styles -- the tap-zone debug overlay draws measured pixel rectangles, which cannot be static classes. */
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { CoverCacheContextValue } from '@app/cache';
import type { PageFitInput } from '../page-fit.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { calculateTapZones } from '../tap-zones.js';
import type {
  ReaderNavigationAction,
  ReaderOverlayInsets,
  ReaderPage,
  ReaderSessionInput,
  ReaderState,
} from '../types.js';
import { ReaderPagedLayer } from './ReaderPagedLayer.js';
import type { ReaderScrollViewHandle } from './ReaderScrollView.js';
import { ReaderScrollLayer } from './ReaderScrollLayer.js';

export interface ReaderStageProps {
  readonly data: ReaderPageData;
  readonly readerState: ReaderState;
  readonly sessionInput: ReaderSessionInput | null;
  readonly cacheContext: CoverCacheContextValue | null;
  readonly reducedMotion: boolean;
  readonly fitInput: PageFitInput;
  readonly visiblePages: readonly ReaderPage[];
  readonly overlayInsets: ReaderOverlayInsets;
  readonly containerRef: (node: HTMLDivElement | null) => void;
  readonly scrollHandleRef: RefObject<ReaderScrollViewHandle | null>;
  readonly verticalTargetRef: RefObject<number>;
  readonly verticalTargetPendingRef: RefObject<boolean>;
  readonly setReaderState: (updater: (previous: ReaderState | null) => ReaderState | null) => void;
  readonly navigate: (action: ReaderNavigationAction) => void;
  readonly onClose: (() => void) | undefined;
  readonly onToggleChrome: () => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onZoomPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onZoomPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onZoomPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly setPagedLayer: (node: HTMLDivElement | null) => void;
  readonly onPageMetric: (metric: {
    pageIndex: number;
    status: 'loaded' | 'failed';
    fromCache: boolean;
    durationMs: number;
  }) => void;
}

/** The reading surface and its page layers. Chrome and sheets are siblings. */
export function ReaderStage({
  data,
  readerState,
  sessionInput,
  cacheContext,
  reducedMotion,
  fitInput,
  visiblePages,
  overlayInsets,
  containerRef,
  scrollHandleRef,
  verticalTargetRef,
  verticalTargetPendingRef,
  setReaderState,
  navigate,
  onClose,
  onPointerUp,
  onZoomPointerDown,
  onZoomPointerMove,
  onZoomPointerUp,
  setPagedLayer,
  onPageMetric,
}: ReaderStageProps) {
  const isScrollMode = readerState.mode === 'scroll';

  return (
    <div
      ref={containerRef}
      className="reader-stage-background relative h-full w-full overflow-hidden"
      style={{ '--reader-stage-color': data.settings.backgroundColor } as CSSProperties}
      onPointerUp={onPointerUp}
      data-testid="reader-surface"
    >
      {isScrollMode ? (
        <ReaderScrollLayer
          data={data}
          readerState={readerState}
          cacheContext={cacheContext}
          reducedMotion={reducedMotion}
          onActivePageChange={(index) => {
            if (!verticalTargetPendingRef.current || index === verticalTargetRef.current) {
              verticalTargetRef.current = index;
              verticalTargetPendingRef.current = false;
            }
            setReaderState((previous) =>
              previous === null
                ? previous
                : { ...previous, activePageIndex: index, visiblePageIndexes: [index] },
            );
          }}
          onHandle={(handle) => {
            scrollHandleRef.current = handle;
          }}
          onBack={onClose}
          onPageMetric={onPageMetric}
        />
      ) : (
        <ReaderPagedLayer
          readerState={readerState}
          visiblePages={visiblePages}
          data={data}
          fitInput={fitInput}
          cacheContext={cacheContext}
          imageSmoothing={data.engineSettings.imageSmoothing !== false}
          setPagedLayer={setPagedLayer}
          onPointerDown={onZoomPointerDown}
          onPointerMove={onZoomPointerMove}
          onPointerUp={onZoomPointerUp}
          onSkip={() => navigate({ type: 'nextPage' })}
          onBack={onClose}
          onPageMetric={onPageMetric}
        />
      )}

      {data.engineSettings.tapZoneDebugOverlay && sessionInput ? (
        <TapZoneDebugOverlay input={sessionInput} zoom={readerState.zoom} insets={overlayInsets} />
      ) : null}
    </div>
  );
}

function TapZoneDebugOverlay({
  input,
  zoom,
  insets,
}: {
  input: ReaderSessionInput;
  zoom: ReaderState['zoom'];
  insets: ReaderOverlayInsets;
}) {
  const zones = calculateTapZones(input, insets, zoom);

  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-hidden="true">
      {zones.map((zone) => (
        <div
          key={zone.id}
          className="absolute border border-dashed border-primary/70 bg-primary/10"
          style={{ left: zone.x, top: zone.y, width: zone.width, height: zone.height }}
        />
      ))}
    </div>
  );
}
