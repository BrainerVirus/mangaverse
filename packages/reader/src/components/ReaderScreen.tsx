import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ReaderChrome,
} from '@app/design-system';
import { useReducedMotion } from '@app/motion';
import type { ReaderSettings } from '@app/shared';
import {
  CachedPageImage,
  markChapterPagesAsRead,
  prefetchChapterPages,
  useCoverCacheContext,
} from '@app/cache';
import { resolveKeyboardAction } from '../navigation.js';
import { isDoubleTap, PAN_THRESHOLD_PX, pinchScale, pointerDistance } from '../gestures.js';
import { resolvePageFit } from '../page-fit.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { computeScrollTargetTop, resolveVerticalNavigationTarget } from '../scroll-navigation.js';
import { applyDoubleTapZoom, applyPan, applyPinchZoom, clampZoomScale, clampZoomTransform } from '../zoom.js';
import { ReaderScrollView, type ReaderScrollViewHandle } from './ReaderScrollView.js';
import { ReaderSettingsSheet } from './reader-settings-sheet.js';
import { useReaderProgress } from './use-reader-progress.js';
import { useReaderSession } from './use-reader-session.js';
import { calculateTapZones } from '../tap-zones.js';
import type {
  ReaderOverlayInsets,
  ReaderProgressEvent,
  ReaderSessionInput,
  ReaderState,
  ReaderViewport,
  TapZoneRegion,
  ZoomStateSummary,
} from '../types.js';

const CHROME_INSETS: ReaderOverlayInsets = { top: 96, right: 0, bottom: 48, left: 0 };

const OBJECT_FIT_CLASS = {
  contain: 'object-contain',
  cover: 'object-cover',
  none: 'object-none',
} as const;

export interface ReaderScreenProps {
  data: ReaderPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  chromeVisible: boolean;
  onToggleChrome: () => void;
  onPersistProgress?: (event: ReaderProgressEvent) => void;
  onChangeSettings?: (patch: Partial<ReaderSettings>) => void;
  onRetry?: () => void;
  /** True when the data fetch is paused because the browser is offline. */
  isOffline?: boolean;
}

function findTapZone(
  zones: readonly TapZoneRegion[],
  x: number,
  y: number,
): TapZoneRegion | undefined {
  return zones.find(
    (zone) =>
      zone.width > 0 &&
      zone.height > 0 &&
      x >= zone.x &&
      x < zone.x + zone.width &&
      y >= zone.y &&
      y < zone.y + zone.height,
  );
}

interface ActivePointer {
  readonly x: number;
  readonly y: number;
}

interface PointerGesture {
  /** Pointers currently down, keyed by pointerId; two of them mean a pinch. */
  readonly pointers: Map<number, ActivePointer>;
  /** Pinch baseline: scale and separation when the second pointer landed. */
  pinch: { readonly scale: number; readonly distance: number } | null;
  lastTap: { readonly time: number; readonly x: number; readonly y: number } | null;
  /** Set once a drag passes the pan threshold, so its pointer-up is not a tap. */
  moved: boolean;
}

function createPointerGesture(): PointerGesture {
  return { pointers: new Map(), pinch: null, lastTap: null, moved: false };
}

function useReaderViewport() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<ReaderViewport>({
    width: 800,
    height: 600,
    orientation: 'landscape',
  });

  useEffect(() => {
    if (!node) return;

    const update = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      // An unmeasurable node (jsdom, a hidden container) keeps the default
      // viewport instead of collapsing every fit box to zero.
      if (width <= 0 || height <= 0) return;
      setViewport({
        width,
        height,
        orientation: width >= height ? 'landscape' : 'portrait',
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  // Callback ref, not a mount effect: the surface only renders after loading, so
  // an effect with `[]` deps ran while the ref was still null and never observed
  // the real container — leaving tap zones computed against the 800x600 default.
  return { containerRef: setNode, viewport };
}

export function ReaderScreen({
  data,
  isLoading,
  isError,
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
  const activeIndexRef = useRef(0);
  // Vertical navigation resolves from the last target, not the centre-based
  // active page: during a smooth scroll the active page lags behind and rapid
  // presses would otherwise all resolve to the same index. `verticalTargetPending`
  // keeps scroll-driven updates from overwriting a burst that is still landing.
  const verticalTargetRef = useRef(0);
  const verticalTargetPendingRef = useRef(false);
  const pointerRef = useRef<PointerGesture>(createPointerGesture());
  const reducedMotion = useReducedMotion();
  const cacheContext = useCoverCacheContext();
  const { containerRef, viewport } = useReaderViewport();
  const { sessionInput, readerState, setReaderState, navigate } = useReaderSession(data, viewport);
  useReaderProgress(data, readerState, onPersistProgress);

  const updateZoom = useCallback(
    (transform: (zoom: ZoomStateSummary) => ZoomStateSummary) => {
      setReaderState((previous) =>
        previous === null ? previous : { ...previous, zoom: transform(previous.zoom) },
      );
    },
    [setReaderState],
  );

  useEffect(() => {
    if (!data || cacheContext === null) {
      return;
    }

    const pages = data.chapter.pages.map((page, pageIndex) => ({
      pageIndex,
      remoteUrl: page.image.url,
    }));

    void prefetchChapterPages({
      db: cacheContext.db,
      adapter: cacheContext.adapter,
      providerId: data.providerId,
      mangaId: data.mangaId,
      chapterId: data.chapterId,
      pages,
      retention: 'read',
    }).then(() =>
      markChapterPagesAsRead(cacheContext.db, {
        providerId: data.providerId,
        mangaId: data.mangaId,
        chapterId: data.chapterId,
      }),
    );
  }, [cacheContext, data]);

  useEffect(() => {
    if (!sessionInput) return;

    const pageCount = sessionInput.chapter.pageCount;
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveKeyboardAction(event, sessionInput.settings);
      if (action.type === 'none') return;
      event.preventDefault();
      if (sessionInput.settings.readingMode === 'vertical') {
        // In the continuous strip, navigation moves the scroll position to the
        // target page's centre; the target advances on the press itself, so a
        // burst of presses is never resolved from a stale (centre-based) index.
        const handle = scrollHandleRef.current;
        const target = resolveVerticalNavigationTarget(verticalTargetRef.current, action, pageCount);
        verticalTargetRef.current = target;
        verticalTargetPendingRef.current = true;
        if (!handle) return;
        const container = handle.scrollContainer();
        if (container === null) return;
        container.scrollTo({
          top: computeScrollTargetTop(
            handle.measurePages(),
            target,
            container.clientHeight,
            container.scrollHeight,
          ),
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
        return;
      }
      navigate(action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, reducedMotion, sessionInput]);

  const handleZoomPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerRef.current;
    gesture.moved = false;
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gesture.pointers.size === 2 && readerState !== null) {
      const [first, second] = [...gesture.pointers.values()];
      if (first !== undefined && second !== undefined) {
        gesture.pinch = {
          scale: readerState.zoom.scale,
          distance: pointerDistance(first, second),
        };
      }
    }
  }, [readerState]);

  const handleZoomPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = pointerRef.current;
      const pointer = gesture.pointers.get(event.pointerId);
      if (pointer === undefined || readerState === null) return;

      gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const rect = event.currentTarget.getBoundingClientRect();

      if (gesture.pointers.size >= 2) {
        const pinch = gesture.pinch;
        const [first, second] = [...gesture.pointers.values()];
        if (pinch === null || first === undefined || second === undefined) return;
        gesture.moved = true;
        updateZoom((zoom) =>
          clampZoomTransform(
            applyPinchZoom(zoom, zoom.scale, pinchScale(pinch, pointerDistance(first, second)), {
              centerX: (first.x + second.x) / 2 - rect.left,
              centerY: (first.y + second.y) / 2 - rect.top,
            }),
            rect.width,
            rect.height,
            rect.width,
            rect.height,
          ),
        );
        return;
      }

      if (readerState.zoom.scale <= 1) return;

      const deltaX = event.clientX - pointer.x;
      const deltaY = event.clientY - pointer.y;
      if (!gesture.moved && Math.hypot(deltaX, deltaY) < PAN_THRESHOLD_PX) {
        return;
      }
      gesture.moved = true;
      updateZoom((zoom) =>
        clampZoomTransform(
          applyPan(zoom, deltaX, deltaY),
          rect.width,
          rect.height,
          rect.width,
          rect.height,
        ),
      );
    },
    [readerState, updateZoom],
  );

  const handleZoomPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerRef.current;
    gesture.pointers.delete(event.pointerId);
    if (gesture.pointers.size < 2) {
      gesture.pinch = null;
    }
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!sessionInput || !readerState) return;

      const gesture = pointerRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // A double tap zooms instead of turning the page (pointer-based, so touch
      // devices get it too; `dblclick` never fires there).
      const tap = { time: Date.now(), x: event.clientX, y: event.clientY };
      const doubleTap = !gesture.moved && isDoubleTap(gesture.lastTap, tap);
      gesture.lastTap = gesture.moved ? null : tap;
      gesture.moved = false;
      if (doubleTap) {
        updateZoom((zoom) =>
          clampZoomTransform(
            applyDoubleTapZoom(
              zoom,
              { x, y },
              rect.width,
              rect.height,
              clampZoomScale(zoom, sessionInput.settings.doubleTapZoom),
            ),
            rect.width,
            rect.height,
            rect.width,
            rect.height,
          ),
        );
        return;
      }

      const zones = calculateTapZones(sessionInput, CHROME_INSETS, readerState.zoom);
      const zone = findTapZone(zones, x, y);
      const action = zone?.action ?? { type: 'none' as const };

      if (action.type === 'toggleChrome') {
        onToggleChrome();
        return;
      }

      if (action.type === 'prevPage' || action.type === 'nextPage') {
        navigate({ type: action.type });
      }
    },
    [navigate, onToggleChrome, readerState, sessionInput, updateZoom],
  );

  const settings = data?.settings;
  const isScrollMode = readerState?.mode === 'scroll';
  activeIndexRef.current = readerState?.activePageIndex ?? 0;
  const chromeMode: 'single' | 'double' | 'scroll' = isScrollMode
    ? 'scroll'
    : settings?.pageLayout === 'double'
      ? 'double'
      : 'single';

  const handleModeChange = useCallback(
    (mode: 'single' | 'double' | 'scroll' | 'webtoon') => {
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
    },
    [onChangeSettings, settings?.readingMode],
  );

  const handleToggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void document.documentElement.requestFullscreen?.();
  }, []);

  if (isLoading) {
    return <LoadingState type="detail" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load chapter"
        message="Local chapter data failed to load. Try again in a moment."
        {...(onRetry !== undefined ? { onRetry } : {})}
      />
    );
  }

  if (isOffline && (!data || !readerState)) {
    return (
      <ErrorState
        title="You are offline"
        message="This chapter is not saved locally yet. Reconnect and retry."
        {...(onRetry !== undefined ? { onRetry } : {})}
      />
    );
  }

  if (!data || !readerState) {
    // A pending or paused (unfocused/online) fetch with no data is still loading;
    // a genuinely empty chapter has data with pageCount 0 and is handled below.
    return <LoadingState type="detail" />;
  }

  if (data.chapter.pageCount === 0) {
    return <EmptyState type="no-chapters" />;
  }

  const currentPage = readerState.activePageIndex + 1;
  const visiblePages = readerState.visiblePageIndexes
    .map((index) => data.chapter.pages[index])
    .filter((page) => page !== undefined);
  const activePage = data.chapter.pages[readerState.activePageIndex];
  const naturalSize =
    activePage?.width !== undefined &&
    activePage.height !== undefined &&
    activePage.width > 0 &&
    activePage.height > 0
      ? { width: activePage.width, height: activePage.height }
      : undefined;
  const fit = resolvePageFit({
    fitMode: data.engineSettings.fitMode,
    availableWidth: viewport.width - CHROME_INSETS.left - CHROME_INSETS.right,
    availableHeight: viewport.height - CHROME_INSETS.top - CHROME_INSETS.bottom,
    pageCount: visiblePages.length,
    ...(naturalSize !== undefined ? { naturalSize } : {}),
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
              if (
                !verticalTargetPendingRef.current ||
                index === verticalTargetRef.current
              ) {
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
            {visiblePages.map((page) =>
              cacheContext !== null ? (
                <div
                  key={page.id}
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
                  />
                </div>
              ) : (
                <div
                  key={page.id}
                  data-testid="reader-page-box"
                  data-fit-mode={data.engineSettings.fitMode}
                  data-object-fit={fit.objectFit}
                  style={{
                    width: `${fit.box.width}px`,
                    height: `${fit.box.height}px`,
                    flex: '0 0 auto',
                  }}
                  className="animate-pulse bg-muted/80"
                  aria-hidden
                />
              ),
            )}
          </div>
        )}

        {data.engineSettings.tapZoneDebugOverlay && sessionInput ? (
          <TapZoneDebugOverlay input={sessionInput} zoom={readerState.zoom} />
        ) : null}
      </div>

      <ReaderChrome
        visible={chromeVisible}
        chapterTitle={data.chapter.title}
        currentPage={currentPage}
        totalPages={data.chapter.pageCount}
        onPageChange={(page) =>
          isScrollMode
            ? scrollHandleRef.current?.scrollToPage(page - 1)
            : navigate({ type: 'goToPage', pageIndex: page - 1 })
        }
        renderPagePreview={(page) => {
          const target = data.chapter.pages[page - 1];
          if (target === undefined || cacheContext === null) {
            return <div className="h-24 w-16 animate-pulse bg-white/10" aria-hidden />;
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
        onToggleFullscreen={handleToggleFullscreen}
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
