import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { EmptyState, Button, ErrorState, GlassSurface, LoadingState } from '@app/design-system';
import { useReducedMotion } from '@app/design-system/motion';
import type { ReaderSettings } from '@app/shared';
import { useCoverCacheContext, CachedPageImage } from '@app/cache';
import type { PageFitInput } from '../page-fit.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { ReaderOverlays } from './ReaderOverlays.js';
import { ReaderStage } from './ReaderStage.js';
import type { ReaderScrollViewHandle } from './ReaderScrollView.js';
import { useChapterPrefetch, useOfflinePagesNote } from './use-chapter-cache.js';
import { useReaderDiagnostics } from './use-reader-diagnostics.js';
import { useReaderFullscreen } from './use-reader-fullscreen.js';
import { useReaderGestures } from './use-reader-gestures.js';
import { useReaderKeyboard, useReaderWheelZoom } from './use-reader-listeners.js';
import { useReaderPageTransition } from './use-reader-page-transition.js';
import { useReaderProgress } from './use-reader-progress.js';
import { useReaderSession } from './use-reader-session.js';
import { useReaderViewport } from './use-reader-viewport.js';
import { useScreenWakeLock } from './use-screen-wake-lock.js';
import type {
  ReaderNavigationAction,
  ReaderOverlayInsets,
  ReaderPage,
  ReaderProgressEvent,
  ReaderSessionInput,
  ReaderState,
  ReaderViewport,
} from '../types.js';

const CHROME_INSETS: ReaderOverlayInsets = { top: 96, right: 0, bottom: 48, left: 0 };

type ChromeMode = 'single' | 'double' | 'scroll';

function resolveChromeVisible(settings: ReaderSettings | undefined, visible: boolean): boolean {
  return (
    settings?.chromeVisibility === 'always' || (settings?.chromeVisibility !== 'hidden' && visible)
  );
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

/** One chapter action, one status line: persistence failures must never be silent. */
async function runReaderAction(
  action: (() => void | Promise<void>) | undefined,
  success: string,
  setStatus: (message: string) => void,
  onSuccess?: () => void,
): Promise<void> {
  if (action === undefined) return;
  try {
    await action();
    onSuccess?.();
    setStatus(success);
  } catch {
    setStatus('Could not update read state. Try again.');
  }
}
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
  const width = page?.image.width ?? page?.width;
  const height = page?.image.height ?? page?.height;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return undefined;
  return { width, height };
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
  onClose?: (() => void) | undefined;
  onPreviousChapter?: (() => void) | undefined;
  onNextChapter?: (() => void) | undefined;
  onResetSettings?: (() => void) | undefined;
  /** Persists the current chapter's read/unread state; resolves once durable. */
  onMarkRead?: ((completed: boolean) => void | Promise<void>) | undefined;
  onMarkPreviousRead?: (() => void | Promise<void>) | undefined;
}

export function ReaderScreen(props: ReaderScreenProps) {
  const {
    data,
    isLoading,
    isError,
    isHydrating = false,
    isHydrationError = false,
    isOffline = false,
    onClose,
  } = props;
  const [chapterEndOpen, setChapterEndOpen] = useState(false);
  const handleChapterEnd = useCallback(() => setChapterEndOpen(true), []);
  const reducedMotion = useReducedMotion();
  const { containerRef, surface, viewport } = useReaderViewport();
  const { sessionInput, readerState, setReaderState, navigate } = useReaderSession(
    data,
    viewport,
    handleChapterEnd,
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
    return (
      <>
        {onClose ? (
          <Button className="fixed top-4 left-4 z-50" onClick={onClose}>
            Close reader
          </Button>
        ) : null}
        {readerGateView({ gate, title: data?.chapter.title ?? '', onRetry: props.onRetry })}
      </>
    );
  }

  if (data === undefined || readerState === null) {
    return <LoadingState type="detail" />;
  }

  return (
    <ReaderReadyView
      {...props}
      data={data}
      readerState={readerState}
      sessionInput={sessionInput}
      setReaderState={setReaderState}
      navigate={navigate}
      viewport={viewport}
      surface={surface}
      containerRef={containerRef}
      reducedMotion={reducedMotion}
      chapterEndOpen={chapterEndOpen}
      onChapterEndOpenChange={setChapterEndOpen}
    />
  );
}

type ReaderReadyProps = ReaderScreenProps & {
  readonly data: ReaderPageData;
  readonly readerState: ReaderState;
  readonly sessionInput: ReaderSessionInput | null;
  readonly setReaderState: Dispatch<SetStateAction<ReaderState | null>>;
  readonly navigate: (action: ReaderNavigationAction) => void;
  readonly viewport: ReaderViewport;
  readonly surface: HTMLDivElement | null;
  readonly containerRef: (node: HTMLDivElement | null) => void;
  readonly reducedMotion: boolean;
  readonly chapterEndOpen: boolean;
  readonly onChapterEndOpenChange: (open: boolean) => void;
};

function ReaderReadyView({
  data,
  readerState,
  sessionInput,
  setReaderState,
  navigate,
  viewport,
  surface,
  containerRef,
  reducedMotion,
  chapterEndOpen,
  onChapterEndOpenChange,
  chromeVisible,
  onToggleChrome,
  onPersistProgress,
  onChangeSettings,
  isOffline = false,
  onClose,
  onPreviousChapter,
  onNextChapter,
  onResetSettings,
  onMarkRead,
  onMarkPreviousRead,
}: ReaderReadyProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chapterActionsOpen, setChapterActionsOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const scrollHandleRef = useRef<ReaderScrollViewHandle | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const pageTransitionLayerRef = useRef<HTMLDivElement | null>(null);
  // Vertical navigation resolves from the last target, not the centre-based
  // active page: during a smooth scroll the active page lags behind and rapid
  // presses would otherwise all resolve to the same index. `verticalTargetPending`
  // keeps scroll-driven updates from overwriting a burst that is still landing.
  const verticalTargetRef = useRef(0);
  const verticalTargetPendingRef = useRef(false);
  const cacheContext = useCoverCacheContext();
  const diagnosticsEnabled = data.settings.diagnosticsEnabled;
  const diagnostics = useReaderDiagnostics(diagnosticsEnabled);
  const progress = useReaderProgress(data, readerState, onPersistProgress);
  useChapterPrefetch(data, cacheContext, readerState.activePageIndex, diagnostics.recordPrefetch);
  useScreenWakeLock(data.settings.keepScreenOn);
  const { toggleFullscreen } = useReaderFullscreen({
    openOnEnter: data.settings.fullscreenOnOpen,
    reducedMotion,
  });
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
  const setPageTransitionLayer = useCallback((node: HTMLDivElement | null) => {
    pageTransitionLayerRef.current = node;
  }, []);
  useReaderKeyboard({
    sessionInput,
    navigate,
    reducedMotion,
    scrollHandle: scrollHandleRef,
    verticalTarget: verticalTargetRef,
    verticalTargetPending: verticalTargetPendingRef,
    disabled: settingsOpen || chapterEndOpen || chapterActionsOpen,
    onClose,
    onToggleChrome,
    onToggleFullscreen: toggleFullscreen,
    onPreviousChapter,
    onNextChapter,
  });
  useReaderPageTransition({
    pageLayer: pageTransitionLayerRef,
    activePageIndex: readerState.activePageIndex,
    mode: data.engineSettings.pageTransition ?? 'none',
    rtl: data.engineSettings.readingMode === 'rtl',
    reducedMotion,
  });

  const settings = data.settings;
  const isScrollMode = readerState.mode === 'scroll';
  const chromeMode = resolveChromeMode(settings, isScrollMode);
  const handleModeChange = useCallback(
    (mode: 'single' | 'double' | 'scroll' | 'webtoon') =>
      applyReadingModeChange(mode, settings, onChangeSettings),
    [onChangeSettings, settings],
  );
  const handleMarkRead = useCallback(
    (completed: boolean) =>
      runReaderAction(
        onMarkRead === undefined ? undefined : () => onMarkRead(completed),
        completed ? 'Chapter marked read' : 'Chapter marked unread',
        setStatus,
        progress.cancelPendingCheckpoint,
      ),
    [onMarkRead, progress.cancelPendingCheckpoint],
  );
  const handleMarkPreviousRead = useCallback(
    () =>
      runReaderAction(
        onMarkPreviousRead,
        'Previous chapters marked read',
        setStatus,
        progress.cancelPendingCheckpoint,
      ),
    [onMarkPreviousRead, progress.cancelPendingCheckpoint],
  );

  const visiblePages = readerState.visiblePageIndexes
    .map((index) => data.chapter.pages[index])
    .filter((page) => page !== undefined);
  const fitInput: PageFitInput = {
    fitMode: data.engineSettings.fitMode,
    availableWidth: viewport.width - CHROME_INSETS.left - CHROME_INSETS.right,
    availableHeight: viewport.height - CHROME_INSETS.top - CHROME_INSETS.bottom,
    pageCount: visiblePages.length,
    naturalSize: resolveNaturalSize(data.chapter.pages[readerState.activePageIndex]),
  };

  return (
    <>
      {/*
        The tap handler lives on the surface alone: the chrome and the settings
        sheet are siblings, so their pointer events can never reach the tap-zone
        logic and skip a page while the user adjusts settings.
      */}
      <ReaderStage
        data={data}
        readerState={readerState}
        sessionInput={sessionInput}
        cacheContext={cacheContext}
        reducedMotion={reducedMotion}
        fitInput={fitInput}
        visiblePages={visiblePages}
        overlayInsets={CHROME_INSETS}
        containerRef={containerRef}
        scrollHandleRef={scrollHandleRef}
        verticalTargetRef={verticalTargetRef}
        verticalTargetPendingRef={verticalTargetPendingRef}
        setReaderState={setReaderState}
        navigate={navigate}
        onClose={onClose}
        onToggleChrome={onToggleChrome}
        onPointerUp={handlePointerUp}
        onZoomPointerDown={handleZoomPointerDown}
        onZoomPointerMove={handleZoomPointerMove}
        onZoomPointerUp={handleZoomPointerUp}
        setPagedLayer={zoomLayerRef}
        setPageTransitionLayer={setPageTransitionLayer}
        onPageMetric={diagnostics.recordPageLoad}
      />

      <OfflineNote note={offlineNote} />

      <ReaderOverlays
        chapterTitle={data.chapter.title}
        sourceName={data.sourceName}
        currentPage={readerState.activePageIndex + 1}
        totalPages={data.chapter.pageCount}
        visible={resolveChromeVisible(settings, chromeVisible)}
        mode={chromeMode}
        settingsOpen={settingsOpen}
        settings={settings}
        status={status}
        chapterEndOpen={chapterEndOpen}
        chapterActionsOpen={chapterActionsOpen}
        diagnostics={diagnosticsEnabled ? diagnostics.snapshot : undefined}
        settingsButtonRef={settingsButtonRef}
        onClose={onClose}
        onPageChange={(page) =>
          isScrollMode
            ? scrollHandleRef.current?.scrollToPage(page - 1)
            : navigate({ type: 'goToPage', pageIndex: page - 1 })
        }
        renderPagePreview={(page) => (
          <PagePreview data={data} page={page} cacheReady={cacheContext !== null} />
        )}
        onModeChange={handleModeChange}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenChapterActions={() => setChapterActionsOpen(true)}
        onToggleFullscreen={toggleFullscreen}
        onCloseSettings={() => setSettingsOpen(false)}
        onChangeSettings={onChangeSettings}
        onResetSettings={onResetSettings}
        onClearDiagnostics={diagnostics.clear}
        onChapterEndOpenChange={onChapterEndOpenChange}
        onChapterActionsOpenChange={setChapterActionsOpen}
        onNextChapter={onNextChapter}
        onPreviousChapter={onPreviousChapter}
        onMarkRead={onMarkRead === undefined ? undefined : handleMarkRead}
        onMarkPreviousRead={onMarkPreviousRead === undefined ? undefined : handleMarkPreviousRead}
      />
    </>
  );
}

function OfflineNote({ note }: { note: string | null }) {
  if (note === null) return null;
  return (
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
        <span className="relative block px-3 py-1 text-xs text-white">{note}</span>
      </div>
    </output>
  );
}

function PagePreview({
  data,
  page,
  cacheReady,
}: {
  data: ReaderPageData;
  page: number;
  cacheReady: boolean;
}) {
  const target = data.chapter.pages[page - 1];
  if (!target || !cacheReady) return <div className="h-24 w-16 bg-glass-plate" aria-hidden />;
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
