import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  EmptyState,
  ErrorState,
  GlassSurface,
  LoadingState,
  ReaderChrome,
} from '@app/design-system';
import { useReducedMotion } from '@app/motion';
import type { ReaderSettings } from '@app/shared';
import { CachedPageImage, useCoverCacheContext, type CoverCacheContextValue } from '@app/cache';
import { resolvePageFit, type PageFit } from '../page-fit.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { ReaderScrollView, type ReaderScrollViewHandle } from './ReaderScrollView.js';
import { ReaderSettingsSheet } from './reader-settings-sheet.js';
import { useChapterPrefetch, useOfflinePagesNote } from './use-chapter-cache.js';
import { useReaderGestures } from './use-reader-gestures.js';
import { useReaderKeyboard, useReaderWheelZoom } from './use-reader-listeners.js';
import { useReaderProgress } from './use-reader-progress.js';
import { useReaderSession } from './use-reader-session.js';
import { useReaderViewport } from './use-reader-viewport.js';
import { calculateTapZones } from '../tap-zones.js';
import type {
  ReaderOverlayInsets,
  ReaderPage,
  ReaderProgressEvent,
  ReaderSessionInput,
  ReaderState,
} from '../types.js';

const CHROME_INSETS: ReaderOverlayInsets = { top: 96, right: 0, bottom: 48, left: 0 };

const OBJECT_FIT_CLASS = {
  contain: 'object-contain',
  cover: 'object-cover',
  none: 'object-none',
} as const;

type ChromeMode = 'single' | 'double' | 'scroll';

function toggleFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void document.documentElement.requestFullscreen?.();
}

function resolveChromeMode(
  settings: ReaderSettings | undefined,
  isScrollMode: boolean,
): ChromeMode {
  if (isScrollMode) return 'scroll';
  return settings?.pageLayout === 'double' ? 'double' : 'single';
}

type ReaderGate =
  | 'loading'
  | 'error'
  | 'hydrating'
  | 'hydration-error'
  | 'offline'
  | 'empty'
  | null;

function applyReadingModeChange(
  mode: 'single' | 'double' | 'scroll' | 'webtoon',
  settings: ReaderSettings | undefined,
  onChangeSettings: ((patch: Partial<ReaderSettings>) => void) | undefined,
): void {
  if (!onChangeSettings) return;
  if (mode === 'scroll') {
    onChangeSettings({ readingMode: 'vertical' });
    return;
  }
  const pageLayout = mode === 'double' ? 'double' : 'single';
  // Returning from the strip needs a page reading mode again.
  onChangeSettings(
    settings?.readingMode === 'vertical' ? { readingMode: 'ltr', pageLayout } : { pageLayout },
  );
}

/** The surface for a gate that replaces the reading view, in gate priority order. */
function readerGateView({
  gate,
  title,
  onRetry,
}: {
  readonly gate: Exclude<ReaderGate, null>;
  readonly title: string;
  readonly onRetry: (() => void) | undefined;
}): ReactNode {
  switch (gate) {
    case 'error':
      return (
        <ErrorState
          title="Could not load chapter"
          message="Local chapter data failed to load. Try again in a moment."
          {...retryProps(onRetry)}
        />
      );
    case 'hydrating':
      return (
        <ReaderPendingStage kind="hydrating" title={title}>
          <LoadingState type="detail" />
        </ReaderPendingStage>
      );
    case 'hydration-error':
      return (
        <ReaderPendingStage kind="error" title={title}>
          <ErrorState
            title="Could not load chapter"
            message="The chapter is saved locally, but its pages could not be fetched from the provider."
            {...retryProps(onRetry)}
          />
        </ReaderPendingStage>
      );
    case 'offline':
      return (
        <ErrorState
          title="You are offline"
          message="This chapter is not saved locally yet. Reconnect and retry."
          {...retryProps(onRetry)}
        />
      );
    case 'loading':
      return <LoadingState type="detail" />;
    case 'empty':
      return <EmptyState type="no-chapters" />;
    default:
      return null;
  }
}

/** `exactOptionalPropertyTypes` forbids passing an absent callback explicitly. */
function retryProps(onRetry: (() => void) | undefined): { readonly onRetry?: () => void } {
  return onRetry === undefined ? {} : { onRetry };
}

/** What the surface shows before there is a chapter to read, in priority order. */
function resolveReaderGate(input: {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isOffline: boolean;
  readonly hasSession: boolean;
  readonly pageCount: number;
  readonly isHydrating: boolean;
  readonly isHydrationError: boolean;
}): ReaderGate {
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  // A locally empty chapter is hydrating before it is empty: the metadata is
  // already here, the pages are not, and 'No chapters' would be a lie.
  if (input.pageCount === 0 && input.hasSession) {
    if (input.isHydrationError) return 'hydration-error';
    if (input.isHydrating) return 'hydrating';
  }
  if (input.isOffline && !input.hasSession) return 'offline';
  // A pending or paused (unfocused/online) fetch with no data is still loading;
  // a genuinely empty chapter has data with pageCount 0 and is handled below.
  if (!input.hasSession) return 'loading';
  if (input.pageCount === 0) return 'empty';
  return null;
}

function resolveNaturalSize(
  page: ReaderPage | undefined,
): { readonly width: number; readonly height: number } | undefined {
  if (page?.width === undefined || page.height === undefined) return undefined;
  if (page.width <= 0 || page.height <= 0) return undefined;
  return { width: page.width, height: page.height };
}

export interface ReaderScreenProps {
  data: ReaderPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  /** True while provider pages are being fetched for a locally empty chapter. */
  isHydrating?: boolean;
  /** True when provider hydration failed; the local chapter metadata still exists. */
  isHydrationError?: boolean;
  chromeVisible: boolean;
  onToggleChrome: () => void;
  onPersistProgress?: (event: ReaderProgressEvent) => void;
  onChangeSettings?: (patch: Partial<ReaderSettings>) => void;
  onRetry?: () => void;
  /** True when the data fetch is paused because the browser is offline. */
  isOffline?: boolean;
}

export function ReaderScreen({
  data,
  isLoading,
  isError,
  isHydrating = false,
  isHydrationError = false,
  chromeVisible,
  onToggleChrome,
  onPersistProgress,
  onChangeSettings,
  onRetry,
  isOffline = false,
}: ReaderScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollHandleRef = useRef<ReaderScrollViewHandle | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  // Vertical navigation resolves from the last target, not the centre-based
  // active page: during a smooth scroll the active page lags behind and rapid
  // presses would otherwise all resolve to the same index. `verticalTargetPending`
  // keeps scroll-driven updates from overwriting a burst that is still landing.
  const verticalTargetRef = useRef(0);
  const verticalTargetPendingRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const cacheContext = useCoverCacheContext();
  const { containerRef, surface, viewport } = useReaderViewport();
  const { sessionInput, readerState, setReaderState, navigate } = useReaderSession(data, viewport);
  useReaderProgress(data, readerState, onPersistProgress);
  useChapterPrefetch(data, cacheContext, readerState?.activePageIndex);
  const offlineNote = useOfflinePagesNote(data, cacheContext, isOffline);

  const {
    updateZoom,
    handleZoomPointerDown,
    handleZoomPointerMove,
    handleZoomPointerUp,
    handlePointerUp,
  } = useReaderGestures({
    sessionInput,
    readerState,
    surface,
    overlayInsets: CHROME_INSETS,
    navigate,
    onToggleChrome,
    setReaderState,
  });
  const { zoomLayerRef } = useReaderWheelZoom({ sessionInput, surface, updateZoom });
  useReaderKeyboard({
    sessionInput,
    navigate,
    reducedMotion,
    scrollHandle: scrollHandleRef,
    verticalTarget: verticalTargetRef,
    verticalTargetPending: verticalTargetPendingRef,
  });

  const settings = data?.settings;
  const isScrollMode = readerState?.mode === 'scroll';
  const chromeMode = resolveChromeMode(settings, isScrollMode === true);
  const handleModeChange = useCallback(
    (mode: 'single' | 'double' | 'scroll' | 'webtoon') =>
      applyReadingModeChange(mode, settings, onChangeSettings),
    [onChangeSettings, settings],
  );

  const gate = resolveReaderGate({
    isLoading,
    isError,
    isOffline,
    hasSession: data !== undefined && readerState !== null,
    pageCount: data?.chapter.pageCount ?? 0,
    isHydrating,
    isHydrationError,
  });
  if (gate !== null) {
    return readerGateView({ gate, title: data?.chapter.title ?? '', onRetry });
  }

  if (data === undefined || readerState === null) {
    return <LoadingState type="detail" />;
  }

  const visiblePages = readerState.visiblePageIndexes
    .map((index) => data.chapter.pages[index])
    .filter((page) => page !== undefined);
  const activePage = data.chapter.pages[readerState.activePageIndex];
  const naturalSize = resolveNaturalSize(activePage);
  const fit = resolvePageFit({
    fitMode: data.engineSettings.fitMode,
    availableWidth: viewport.width - CHROME_INSETS.left - CHROME_INSETS.right,
    availableHeight: viewport.height - CHROME_INSETS.top - CHROME_INSETS.bottom,
    pageCount: visiblePages.length,
    naturalSize,
  });

  return (
    <>
      {/*
        The tap handler lives on the surface alone: the chrome and the settings
        sheet are siblings, so their pointer events can never reach the tap-zone
        logic and skip a page while the user adjusts settings.
      */}
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-black"
        onPointerUp={handlePointerUp}
        data-testid="reader-surface"
      >
        {isScrollMode ? (
          <ReaderScrollView
            pages={data.chapter.pages}
            gapPx={data.engineSettings.verticalGapPx}
            activePageIndex={readerState.activePageIndex}
            onActivePageChange={(index) => {
              // Keyboard presses own the target while a burst is landing; any
              // other change (user scroll, scroll settling on the target) wins.
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
            providerId={data.providerId}
            mangaId={data.mangaId}
            chapterId={data.chapterId}
            cacheReady={cacheContext !== null}
            reducedMotion={reducedMotion}
            onHandle={(handle) => {
              scrollHandleRef.current = handle;
            }}
          />
        ) : (
          /*
            The zoom layer is the surface-sized box the pure zoom helpers were
            written for: transform-origin top-left, so translate clamps against
            the same dimensions the helpers receive.
          */
          <div
            ref={zoomLayerRef}
            className="absolute inset-0 flex items-center justify-center"
            data-testid="reader-zoom-layer"
            style={{
              transform: `translate(${readerState.zoom.translateX}px, ${readerState.zoom.translateY}px) scale(${readerState.zoom.scale})`,
              transformOrigin: 'top left',
              touchAction: 'none',
            }}
            onPointerDown={handleZoomPointerDown}
            onPointerMove={handleZoomPointerMove}
            onPointerUp={handleZoomPointerUp}
            onPointerCancel={handleZoomPointerUp}
          >
            {visiblePages.map((page) => (
              <ReaderPageBox
                key={page.id}
                page={page}
                providerId={data.providerId}
                mangaId={data.mangaId}
                chapterId={data.chapterId}
                fit={fit}
                fitMode={data.engineSettings.fitMode}
                cacheContext={cacheContext}
              />
            ))}
          </div>
        )}

        {data.engineSettings.tapZoneDebugOverlay && sessionInput ? (
          <TapZoneDebugOverlay input={sessionInput} zoom={readerState.zoom} />
        ) : null}
      </div>

      {offlineNote !== null ? (
        <output
          data-testid="reader-offline-note"
          className="dark pointer-events-none fixed inset-x-0 bottom-3 z-50 mx-auto block w-fit"
        >
          <div className="relative isolate overflow-hidden rounded-full">
            <GlassSurface
              level="stage"
              tone="reader"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            />
            <span className="relative block px-3 py-1 text-xs text-white">{offlineNote}</span>
          </div>
        </output>
      ) : null}

      <ReaderChrome
        visible={chromeVisible}
        chapterTitle={data.chapter.title}
        currentPage={readerState.activePageIndex + 1}
        totalPages={data.chapter.pageCount}
        onPageChange={(page) =>
          isScrollMode
            ? scrollHandleRef.current?.scrollToPage(page - 1)
            : navigate({ type: 'goToPage', pageIndex: page - 1 })
        }
        renderPagePreview={(page) => {
          const target = data.chapter.pages[page - 1];
          if (target === undefined || cacheContext === null) {
            return <div className="h-24 w-16 bg-glass-plate" aria-hidden />;
          }
          return (
            <CachedPageImage
              providerId={data.providerId}
              mangaId={data.mangaId}
              chapterId={data.chapterId}
              pageIndex={target.index}
              remoteUrl={target.image.url}
              className="h-24 w-auto select-none"
              retention="read"
            />
          );
        }}
        mode={chromeMode}
        onModeChange={handleModeChange}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsButtonRef={settingsButtonRef}
        onToggleFullscreen={toggleFullscreen}
      />

      {settings ? (
        <ReaderSettingsSheet
          open={settingsOpen}
          settings={settings}
          onChangeSettings={onChangeSettings}
          onClose={() => setSettingsOpen(false)}
          settingsButtonRef={settingsButtonRef}
        />
      ) : null}
    </>
  );
}

/**
 * The reader's pre-pages surface: the local chapter title stays visible while
 * provider pages hydrate, or while a failed hydration waits for Retry.
 */
function ReaderPendingStage({
  kind,
  title,
  children,
}: {
  readonly kind: 'hydrating' | 'error';
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className="flex h-full w-full flex-col bg-black"
      data-testid={kind === 'hydrating' ? 'reader-hydrating' : 'reader-hydration-error'}
      aria-busy={kind === 'hydrating' || undefined}
    >
      <div className="safe-area-x safe-area-top flex items-center pb-3">
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {children}
        {kind === 'hydrating' ? (
          <output className="mt-4 block text-sm text-white/70">Loading chapter pages…</output>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One fitted page box. Without a cache context there is nothing to read from
 * yet, so the box keeps its size and pulses instead of collapsing.
 */
function ReaderPageBox({
  page,
  providerId,
  mangaId,
  chapterId,
  fit,
  fitMode,
  cacheContext,
}: {
  readonly page: ReaderPage;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
  readonly fit: PageFit;
  readonly fitMode: string;
  readonly cacheContext: CoverCacheContextValue | null;
}) {
  if (cacheContext === null) {
    return (
      <div
        data-testid="reader-page-box"
        data-fit-mode={fitMode}
        data-object-fit={fit.objectFit}
        style={{
          width: `${fit.box.width}px`,
          height: `${fit.box.height}px`,
          flex: '0 0 auto',
        }}
        className="animate-pulse bg-muted/80"
        aria-hidden
      />
    );
  }

  return (
    <div
      data-testid="reader-page-box"
      data-fit-mode={fitMode}
      data-object-fit={fit.objectFit}
      style={{
        width: `${fit.box.width}px`,
        height: `${fit.box.height}px`,
        flex: '0 0 auto',
        overflow: 'hidden',
      }}
    >
      <CachedPageImage
        providerId={providerId}
        mangaId={mangaId}
        chapterId={chapterId}
        pageIndex={page.index}
        remoteUrl={page.image.url}
        className={`h-full w-full select-none ${OBJECT_FIT_CLASS[fit.objectFit]}`}
        retention="read"
      />
    </div>
  );
}

function TapZoneDebugOverlay({
  input,
  zoom,
}: {
  input: ReaderSessionInput;
  zoom: ReaderState['zoom'];
}) {
  const zones = calculateTapZones(input, CHROME_INSETS, zoom);

  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-hidden="true">
      {zones.map((zone) => (
        <div
          key={zone.id}
          className="absolute border border-dashed border-primary/70 bg-primary/10"
          style={{
            left: zone.x,
            top: zone.y,
            width: zone.width,
            height: zone.height,
          }}
        />
      ))}
    </div>
  );
}
