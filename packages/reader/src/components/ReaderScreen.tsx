import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  ReaderChrome,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@app/design-system';
import type { ReaderSettings } from '@app/shared';
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
  onChangeSettings?: (patch: Partial<ReaderSettings>) => void;
  onRetry?: () => void;
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
}: ReaderScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cacheContext = useCoverCacheContext();
  const { containerRef, viewport } = useReaderViewport();
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const lastPersistedRef = useRef<ReturnType<typeof createProgressEvent> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEventRef = useRef<ReturnType<typeof createProgressEvent> | null>(null);

  const sessionInput = useMemo<ReaderSessionInput | null>(() => {
    if (!data) return null;
    return {
      chapter: data.chapter,
      viewport,
      settings: data.engineSettings,
      initialPageIndex: data.initialPageIndex,
    };
  }, [data, viewport]);

  const sessionChapterRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionInput) {
      setReaderState(null);
      sessionChapterRef.current = null;
      return;
    }
    // Resize ticks recreate `sessionInput` with a new viewport object. Recreating
    // the state with the original initial index would jump the reader back to the
    // start (and drop the pending progress), so keep the current page for the same
    // chapter and only use `initialPageIndex` for first creation or a new chapter.
    const chapterChanged = sessionChapterRef.current !== sessionInput.chapter.id;
    sessionChapterRef.current = sessionInput.chapter.id;
    setReaderState((current) => {
      return createReaderState({
        ...sessionInput,
        initialPageIndex:
          chapterChanged || current === null
            ? (sessionInput.initialPageIndex ?? 0)
            : current.activePageIndex,
      });
    });
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

    pendingEventRef.current = nextEvent;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      lastPersistedRef.current = nextEvent;
      pendingEventRef.current = null;
      onPersistProgress(nextEvent);
    }, PROGRESS_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [data, onPersistProgress, readerState]);

  // Navigating away must not drop the last page change: checkpoint the pending
  // event on unmount instead of leaving it to the cleared debounce timer. Refs
  // for the callback and initial index keep this effect unmount-only, and the
  // blip guard keeps a router transition remount (or a user pressing Back right
  // after opening) from persisting its initial page over newer progress.
  const initialIndexRef = useRef(0);
  initialIndexRef.current = data?.initialPageIndex ?? 0;
  const onPersistRef = useRef(onPersistProgress);
  onPersistRef.current = onPersistProgress;
  const mountedAtRef = useRef(Date.now());

  useEffect(
    () => () => {
      const pending = pendingEventRef.current;
      const persist = onPersistRef.current;
      if (pending === null || persist === undefined) return;

      const lifetimeMs = Date.now() - mountedAtRef.current;
      if (pending.pageIndex === initialIndexRef.current && lifetimeMs < PROGRESS_DEBOUNCE_MS) {
        return;
      }

      pendingEventRef.current = null;
      persist(pending);
    },
    [],
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

  const settings = data?.settings;
  const chromeMode: 'single' | 'double' = settings?.pageLayout === 'double' ? 'double' : 'single';

  const handleModeChange = useCallback(
    (mode: 'single' | 'double' | 'scroll' | 'webtoon') => {
      if (!onChangeSettings) return;
      onChangeSettings({ pageLayout: mode === 'double' ? 'double' : 'single' });
    },
    [onChangeSettings],
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

        {data.engineSettings.tapZoneDebugOverlay && sessionInput ? (
          <TapZoneDebugOverlay input={sessionInput} zoom={readerState.zoom} />
        ) : null}
      </div>

      <ReaderChrome
        visible={chromeVisible}
        chapterTitle={data.chapter.title}
        currentPage={currentPage}
        totalPages={data.chapter.pageCount}
        onPageChange={(page) => navigate({ type: 'goToPage', pageIndex: page - 1 })}
        mode={chromeMode}
        onModeChange={handleModeChange}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {settingsOpen && settings ? (
        <Sheet open onOpenChange={(open) => { if (!open) setSettingsOpen(false); }}>
          <SheetContent side="right" role="dialog" aria-label="Reader settings">
            <SheetHeader>
              <SheetTitle>Reader settings</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Reading direction</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['ltr', 'Left to right'],
                      ['rtl', 'Right to left'],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={settings.readingMode === value ? 'default' : 'outline'}
                      aria-pressed={settings.readingMode === value}
                      onClick={() => onChangeSettings?.({ readingMode: value })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Page layout</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['single', 'Single page'],
                      ['double', 'Double page'],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={settings.pageLayout === value ? 'default' : 'outline'}
                      aria-pressed={settings.pageLayout === value}
                      onClick={() => onChangeSettings?.({ pageLayout: value })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Tap zones</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['leftRight', 'Left / right'],
                      ['grid', 'Grid'],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={settings.tapZoneLayout === value ? 'default' : 'outline'}
                      aria-pressed={settings.tapZoneLayout === value}
                      onClick={() => onChangeSettings?.({ tapZoneLayout: value })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
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
