import type {
  ChapterPage,
  FitMode,
  KeyboardShortcut,
  PageTransitionMode,
  WidePageMode,
} from '@app/shared';

export interface ReaderPage extends ChapterPage {
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: number;
}

export interface ReaderChapter {
  readonly id: string;
  readonly mangaId: string;
  readonly title: string;
  readonly pages: readonly ReaderPage[];
  readonly pageCount: number;
}

export interface ReaderViewport {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'portrait' | 'landscape';
}

export interface ReaderOverlayInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PageSlot {
  readonly pageIndex: number;
  readonly isCover: boolean;
  readonly isLeftPage: boolean;
  readonly isRightPage: boolean;
  /**
   * Set on the two slots of a wide page split across a spread: each slot shows
   * that physical half of the image, whatever the reading direction.
   */
  readonly split?: 'left' | 'right';
  readonly width?: number;
  readonly height?: number;
}

export interface SpreadLayout {
  readonly slots: readonly PageSlot[];
  readonly pageIndexes: readonly number[];
  readonly slotCount: number;
}

export interface TapZoneRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly action: TapZoneAction;
}

export type TapZoneAction =
  | { type: 'prevPage' }
  | { type: 'nextPage' }
  | { type: 'prevChapter' }
  | { type: 'nextChapter' }
  | { type: 'toggleChrome' }
  | { type: 'none' };

export interface TapZoneDebugModel {
  readonly regions: readonly TapZoneRegion[];
  readonly viewport: ReaderViewport;
  readonly overlayInsets: ReaderOverlayInsets;
  readonly readingMode: string;
  readonly zoomState: ZoomStateSummary;
}

export interface ZoomStateSummary {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly minZoom: number;
  readonly maxZoom: number;
}

export interface ReaderSessionInput {
  readonly chapter: ReaderChapter;
  readonly viewport: ReaderViewport;
  readonly settings: ReaderEngineSettings;
  readonly initialPageIndex?: number;
}

/** Where a reader settings change is written (spec R7). */
export type ReaderSettingsScope = 'title' | 'global';

/** Resolved settings: `auto` never reaches the engine. */
export interface ReaderEngineSettings {
  readonly readingMode: 'rtl' | 'ltr' | 'vertical';
  readonly pageLayout: 'single' | 'double' | 'smartSpread';
  readonly fitMode: Exclude<FitMode, 'auto'>;
  readonly tapZoneLayout: 'leftRight' | 'lShaped' | 'grid';
  readonly navigationDirection: 'default' | 'inverted';
  readonly tapZoneDebugOverlay: boolean;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly doubleTapZoom: number;
  readonly gestureSensitivity: number;
  readonly treatFirstPageAsCover: boolean;
  /** How double layouts show a landscape page; `isolate` when absent. */
  readonly widePageMode?: WidePageMode;
  readonly preloadAhead: number;
  /** Pages kept warm behind the active one; one when absent. */
  readonly preloadBehind?: number;
  /** The resolved tall-page tiling threshold in pixels; Auto when absent. */
  readonly tilingThresholdPx?: number;
  /** Data saver: only the pages the viewport shows mount. */
  readonly dataSaver?: boolean;
  readonly lowMemoryMode: boolean;
  readonly wheelBehavior: 'none' | 'scroll' | 'zoom';
  readonly verticalGapPx: number;
  /** The strip width setting; 100 (or absent) is Auto, see `resolveStripMaxWidthPercent`. */
  readonly maxStripWidthPercent?: number;
  /** Populated by toReaderEngineSettings; optional so hand-built engine settings stay valid. */
  readonly pageTransition?: PageTransitionMode;
  readonly pinchSensitivity?: number;
  readonly imageSmoothing?: boolean;
  readonly keepScreenOn?: boolean;
  readonly fullscreenOnOpen?: boolean;
  readonly longStripOptimization?: boolean;
  readonly diagnosticsEnabled?: boolean;
  readonly keyboardShortcuts?: readonly KeyboardShortcut[];
}

export type NavigationActionType =
  | 'prevPage'
  | 'nextPage'
  | 'prevChapter'
  | 'nextChapter'
  | 'firstPage'
  | 'lastPage'
  | 'goToPage'
  | 'toggleChrome'
  | 'toggleFullscreen'
  | 'none';

export interface ReaderNavigationAction {
  readonly type: NavigationActionType;
  readonly pageIndex?: number;
}

export interface ReaderState {
  readonly chapterId: string;
  readonly pages: readonly ReaderPage[];
  readonly settings: ReaderEngineSettings;
  readonly mode: 'scroll' | 'page';
  readonly activePageIndex: number;
  readonly visiblePageIndexes: readonly number[];
  readonly layout: PageLayoutMode;
  readonly zoom: ZoomStateSummary;
  readonly chromeVisible: boolean;
  readonly failedPages: readonly number[];
  readonly preloadQueue: readonly number[];
  readonly diagnostics: ReaderDiagnosticsSnapshot;
}

export type PageLayoutMode = 'single' | 'double' | 'smartSpread';

export interface ReaderProgressEvent {
  readonly chapterId: string;
  readonly mangaId: string;
  readonly pageIndex: number;
  readonly readPercent: number;
  readonly completed: boolean;
  readonly timestamp: string;
}

export interface PreloadItem {
  readonly pageIndex: number;
  readonly priority: number;
  readonly url: string;
}

export interface PreloadPlan {
  readonly items: readonly PreloadItem[];
  readonly lowMemoryMode: boolean;
  readonly maxPreload: number;
}

export interface PageLoadResult {
  readonly pageIndex: number;
  readonly success: boolean;
  readonly errorCode?: string;
  readonly bytesLoaded?: number;
}

export type PreloadRetryState = Readonly<Record<string, number>>;

export const READER_ERROR_CODES = {
  INPUT_INVALID: 'reader.input.invalid',
  PAGE_MISSING: 'reader.page.missing',
  LAYOUT_INVALID: 'reader.layout.invalid',
  NAVIGATION_INVALID: 'reader.navigation.invalid',
  IMAGE_FAILED: 'reader.image.failed',
  PRELOAD_FAILED: 'reader.preload.failed',
} as const;

export interface ReaderDiagnosticsSnapshot {
  readonly timestamp: string;
  readonly chapterId: string;
  readonly activePageIndex: number;
  readonly totalPages: number;
  readonly visiblePageIndexes: readonly number[];
  readonly settings: ReaderEngineSettings;
  readonly zoom: ZoomStateSummary;
  readonly chromeVisible: boolean;
  readonly failedPageCount: number;
  readonly preloadQueueLength: number;
  readonly lowMemoryMode: boolean;
  readonly events: readonly DiagnosticEvent[];
}

export interface DiagnosticEvent {
  readonly type: string;
  readonly timestamp: string;
  readonly data?: Readonly<Record<string, string | number | boolean>>;
}
