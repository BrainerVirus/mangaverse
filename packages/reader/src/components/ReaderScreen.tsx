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
import type { ReaderPageData } from '../reader-page-data.js';
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
} from '../types.js';

const CHROME_INSETS: ReaderOverlayInsets = { top: 96, right: 0, bottom: 48, left: 0 };

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
  const reducedMotion = useReducedMotion();
  const cacheContext = useCoverCacheContext();
  const { containerRef, viewport } = useReaderViewport();
  const { sessionInput, readerState, setReaderState, navigate } = useReaderSession(data, viewport);
  useReaderProgress(data, readerState, onPersistProgress);

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

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveKeyboardAction(event, sessionInput.settings);
      if (action.type === 'none') return;
      event.preventDefault();
      if (sessionInput.settings.readingMode === 'vertical') {
        // In the continuous strip, next/prev move the scroll position.
        if (action.type === 'nextPage') {
          scrollHandleRef.current?.scrollToPage(activeIndexRef.current + 1);
        } else if (action.type === 'prevPage') {
          scrollHandleRef.current?.scrollToPage(Math.max(0, activeIndexRef.current - 1));
        }
        return;
      }
      navigate(action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, sessionInput]);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!sessionInput || !readerState) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
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
    [navigate, onToggleChrome, readerState, sessionInput],
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

  return (
    <>
      {/*
        The tap handler lives on the surface alone: the chrome and the settings
        sheet are siblings, so their pointer events can never reach the tap-zone
        logic and skip a page while the user adjusts settings.
      */}
      <div
        ref={containerRef}
        className="relative h-full w-full bg-black"
        onPointerUp={handlePointerUp}
        data-testid="reader-surface"
      >
        {isScrollMode ? (
          <ReaderScrollView
            pages={data.chapter.pages}
            gapPx={data.engineSettings.verticalGapPx}
            activePageIndex={readerState.activePageIndex}
            onActivePageChange={(index) =>
              setReaderState((previous) =>
                previous === null
                  ? previous
                  : { ...previous, activePageIndex: index, visiblePageIndexes: [index] },
              )
            }
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
        <div className="flex h-full w-full items-center justify-center gap-2 px-2 pt-24 pb-12">
          {visiblePages.map((page) =>
            cacheContext !== null ? (
              <CachedPageImage
                key={page.id}
                providerId={data.providerId}
                mangaId={data.mangaId}
                chapterId={data.chapterId}
                pageIndex={page.index}
                remoteUrl={page.image.url}
                className="max-h-full max-w-full object-contain select-none"
                retention="read"
              />
            ) : (
              <div
                key={page.id}
                className="max-h-full max-w-full flex-1 animate-pulse bg-muted/80 object-contain select-none"
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
