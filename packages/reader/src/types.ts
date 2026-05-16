import type { ChapterPage } from '@app/shared';

export type { ChapterPage, Chapter, ReadingProgress } from '@app/shared';

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

export interface ReaderEngineSettings {
  readonly readingMode: 'rtl' | 'ltr' | 'vertical';
  readonly pageLayout: 'single' | 'double' | 'smartSpread';
  readonly tapZoneLayout: 'leftRight' | 'lShaped' | 'grid';
  readonly navigationDirection: 'default' | 'inverted';
  readonly tapZoneDebugOverlay: boolean;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly doubleTapZoom: number;
  readonly gestureSensitivity: number;
  readonly treatFirstPageAsCover: boolean;
  readonly preloadAhead: number;
  readonly lowMemoryMode: boolean;
  readonly wheelBehavior: 'none' | 'scroll' | 'zoom';
  readonly verticalGapPx: number;
}

export type NavigationActionType =
  | 'prevPage'
  | 'nextPage'
  | 'prevChapter'
  | 'nextChapter'
  | 'firstPage'
  | 'lastPage'
  | 'goToPage'
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

export interface DecodeQueueItem {
  readonly pageIndex: number;
  readonly url: string;
  readonly priority: number;
  readonly retryCount: number;
}

export interface DecodeQueue {
  readonly items: readonly DecodeQueueItem[];
  readonly totalPages: number;
}

export interface PageLoadResult {
  readonly pageIndex: number;
  readonly success: boolean;
  readonly errorCode?: string;
  readonly bytesLoaded?: number;
}

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