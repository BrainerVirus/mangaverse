import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { EmptyState, ErrorState, LoadingState, ReaderChrome } from '@app/design-system';
import {
  CachedPageImage,
  markChapterPagesAsRead,
  prefetchChapterPages,
  useCoverCacheContext,
} from '@app/cache';
import { applyNavigationAction, resolveKeyboardAction, resolveNavigationAction } from '../navigation.js';
import { createProgressEvent, shouldPersistProgress } from '../progress.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { createReaderState } from '../state.js';
import { calculateTapZones } from '../tap-zones.js';
import type {
  ReaderNavigationAction,
  ReaderOverlayInsets,
  ReaderSessionInput,
  ReaderState,
  ReaderViewport,
  TapZoneRegion,
} from '../types.js';

const CHROME_INSETS: ReaderOverlayInsets = { top: 96, right: 0, bottom: 48, left: 0 };
const PROGRESS_DEBOUNCE_MS = 750;

export interface ReaderScreenProps {
  data: ReaderPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  chromeVisible: boolean;
  onToggleChrome: () => void;
  onPersistProgress?: (event: ReturnType<typeof createProgressEvent>) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ReaderViewport>({
    width: 800,
    height: 600,
    orientation: 'landscape',
  });

  useEffect(() => {
    const node = containerRef.current;
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
  }, []);

  return { containerRef, viewport };
}

export function ReaderScreen({
  data,
  isLoading,
  isError,
  chromeVisible,
  onToggleChrome,
  onPersistProgress,
}: ReaderScreenProps) {
  const cacheContext = useCoverCacheContext();
  const { containerRef, viewport } = useReaderViewport();
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const lastPersistedRef = useRef<ReturnType<typeof createProgressEvent> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionInput = useMemo<ReaderSessionInput | null>(() => {
    if (!data) return null;
    return {
      chapter: data.chapter,
      viewport,
      settings: data.engineSettings,
      initialPageIndex: data.initialPageIndex,
    };
  }, [data, viewport]);

  useEffect(() => {
    if (!sessionInput) {
      setReaderState(null);
      return;
    }
    setReaderState(createReaderState(sessionInput));
  }, [sessionInput]);

  const navigate = useCallback(
    (action: ReaderNavigationAction) => {
      if (!sessionInput) return;

      setReaderState((current) => {
        if (!current) return current;
        const resolved = resolveNavigationAction(current, action);
        const applied = applyNavigationAction(current, resolved);
        return createReaderState({
          ...sessionInput,
          initialPageIndex: applied.activePageIndex,
        });
      });
    },
    [sessionInput],
  );

  useEffect(() => {
    if (!data || !readerState || !onPersistProgress) return;

    const nextEvent = createProgressEvent(
      data.chapterId,
      data.mangaId,
      readerState.activePageIndex,
      data.chapter.pageCount,
    );

    const previous = lastPersistedRef.current;
    if (previous !== null && !shouldPersistProgress(previous, nextEvent, { minPagesBetweenPersists: 1 })) {
      return;
    }

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      lastPersistedRef.current = nextEvent;
      onPersistProgress(nextEvent);
    }, PROGRESS_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [data, onPersistProgress, readerState]);

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

  if (isLoading) {
    return <LoadingState type="detail" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load chapter"
        message="Local chapter data failed to load. Try again in a moment."
      />
    );
  }

  if (!data || !readerState) {
    return <EmptyState type="no-chapters" />;
  }

  if (data.chapter.pageCount === 0) {
    return <EmptyState type="no-chapters" />;
  }

  const currentPage = readerState.activePageIndex + 1;
  const visiblePages = readerState.visiblePageIndexes
    .map((index) => data.chapter.pages[index])
    .filter((page) => page !== undefined);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-black"
      onPointerUp={handlePointerUp}
      data-testid="reader-surface"
    >
      <ReaderChrome
        visible={chromeVisible}
        chapterTitle={data.chapter.title}
        currentPage={currentPage}
        totalPages={data.chapter.pageCount}
        onPageChange={(page) => navigate({ type: 'goToPage', pageIndex: page - 1 })}
      />

      <div className="flex h-full w-full items-center justify-center gap-2 px-2 pt-24 pb-12">
        {visiblePages.map((page) => (
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
          )
        ))}
      </div>

      {data.engineSettings.tapZoneDebugOverlay && sessionInput ? (
        <TapZoneDebugOverlay input={sessionInput} zoom={readerState.zoom} />
      ) : null}
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
