import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';

export type ReadingMode = 'rtl' | 'ltr' | 'vertical';

export type PageLayoutMode = 'single' | 'double' | 'smartSpread';

export type FitMode = 'width' | 'height' | 'contain' | 'cover' | 'original';

export type TapZoneLayout = 'leftRight' | 'lShaped' | 'grid';

export type PageTransitionMode = 'none' | 'fade' | 'slide';

export type NavigationDirection = 'default' | 'inverted';

export type WheelBehavior = 'none' | 'scroll' | 'zoom';

export type ReaderChromeVisibility = 'auto' | 'always' | 'hidden';

export interface KeyboardShortcut {
  readonly action: string;
  readonly key: string;
  readonly modifiers?: readonly string[];
}

export interface ReaderSettings {
  readonly readingMode: ReadingMode;
  readonly pageLayout: PageLayoutMode;
  readonly fitMode: FitMode;
  readonly tapZoneLayout: TapZoneLayout;
  readonly tapZoneDebugOverlay: boolean;
  readonly navigationDirection: NavigationDirection;
  readonly pageTransition: PageTransitionMode;
  readonly chromeVisibility: ReaderChromeVisibility;
  /** Number of upcoming pages to speculatively preload. */
  readonly preloadAhead: number;
  /** Vertical gap between strips in vertical mode (px). */
  readonly verticalGapPx: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Default zoom level after a double-tap (e.g. 1.5 = 150%). */
  readonly doubleTapZoom: number;
  /** Pinch zoom sensitivity multiplier. */
  readonly pinchSensitivity: number;
  /** General gesture sensitivity multiplier for tap, pan, and navigation thresholds. */
  readonly gestureSensitivity: number;
  /** Relative brightness between 0 (dim) and 1 (full). */
  readonly brightness: number;
  /** CSS color for reader background. */
  readonly backgroundColor: string;
  /** Whether images use browser smoothing/filtering. */
  readonly imageSmoothing: boolean;
  readonly keepScreenOn: boolean;
  readonly fullscreenOnOpen: boolean;
  readonly wheelBehavior: WheelBehavior;
  readonly keyboardShortcuts: readonly KeyboardShortcut[];
  readonly longStripOptimization: boolean;
  readonly lowMemoryMode: boolean;
  readonly diagnosticsEnabled: boolean;
  readonly rememberPerTitleOverrides: boolean;
}

export type ReaderSettingsOverride = Partial<ReaderSettings>;

export function getDefaultReaderSettings(): ReaderSettings {
  return {
    readingMode: 'ltr',
    pageLayout: 'single',
    fitMode: 'width',
    tapZoneLayout: 'leftRight',
    tapZoneDebugOverlay: false,
    navigationDirection: 'default',
    pageTransition: 'fade',
    chromeVisibility: 'auto',
    preloadAhead: 2,
    verticalGapPx: 8,
    minZoom: 1,
    maxZoom: 3,
    doubleTapZoom: 1.5,
    pinchSensitivity: 1,
    gestureSensitivity: 1,
    brightness: 1,
    backgroundColor: '#000000',
    imageSmoothing: true,
    keepScreenOn: true,
    fullscreenOnOpen: false,
    wheelBehavior: 'scroll',
    keyboardShortcuts: [],
    longStripOptimization: true,
    lowMemoryMode: false,
    diagnosticsEnabled: false,
    rememberPerTitleOverrides: true,
  };
}

export function resolveReaderSettings(
  globalSettings: ReaderSettings,
  overrides: ReaderSettingsOverride | undefined,
): ReaderSettings {
  if (overrides === undefined) return globalSettings;
  return { ...globalSettings, ...overrides };
}

const READING_MODES: ReadonlySet<ReadingMode> = new Set(['rtl', 'ltr', 'vertical']);
const PAGE_LAYOUTS: ReadonlySet<PageLayoutMode> = new Set(['single', 'double', 'smartSpread']);
const FIT_MODES: ReadonlySet<FitMode> = new Set(['width', 'height', 'contain', 'cover', 'original']);
const TAP_ZONES: ReadonlySet<TapZoneLayout> = new Set(['leftRight', 'lShaped', 'grid']);
const PAGE_TRANSITIONS: ReadonlySet<PageTransitionMode> = new Set(['none', 'fade', 'slide']);
const NAV_DIRECTIONS: ReadonlySet<NavigationDirection> = new Set(['default', 'inverted']);
const WHEEL_BEHAVIORS: ReadonlySet<WheelBehavior> = new Set(['none', 'scroll', 'zoom']);
const CHROME_VISIBILITIES: ReadonlySet<ReaderChromeVisibility> = new Set(['auto', 'always', 'hidden']);

export function validateReaderSettings(input: unknown): AppResult<ReaderSettings> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(
      createAppError({ code: 'reader.settings.invalid', message: 'Reader settings must be an object.' }),
    );
  }

  const s = input as Record<string, unknown>;

  const readingMode = s['readingMode'];
  if (typeof readingMode !== 'string' || !READING_MODES.has(readingMode as ReadingMode)) {
    return err(
      createAppError({ code: 'reader.settings.invalid', message: 'Invalid readingMode.' }),
    );
  }

  const pageLayout = s['pageLayout'];
  if (typeof pageLayout !== 'string' || !PAGE_LAYOUTS.has(pageLayout as PageLayoutMode)) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'Invalid pageLayout.' }));
  }

  const fitMode = s['fitMode'];
  if (typeof fitMode !== 'string' || !FIT_MODES.has(fitMode as FitMode)) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'Invalid fitMode.' }));
  }

  const tapZoneLayout = s['tapZoneLayout'];
  if (typeof tapZoneLayout !== 'string' || !TAP_ZONES.has(tapZoneLayout as TapZoneLayout)) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'Invalid tapZoneLayout.' }));
  }

  if (typeof s['tapZoneDebugOverlay'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'tapZoneDebugOverlay must be boolean.' }));
  }

  const navDir = s['navigationDirection'];
  if (typeof navDir !== 'string' || !NAV_DIRECTIONS.has(navDir as NavigationDirection)) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'Invalid navigationDirection.' }));
  }

  const pageTransition = s['pageTransition'];
  if (typeof pageTransition !== 'string' || !PAGE_TRANSITIONS.has(pageTransition as PageTransitionMode)) {
    return err(
      createAppError({ code: 'reader.settings.invalid', message: 'Invalid pageTransition.' }),
    );
  }

  const chromeVisibility = s['chromeVisibility'];
  if (typeof chromeVisibility !== 'string' || !CHROME_VISIBILITIES.has(chromeVisibility as ReaderChromeVisibility)) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'Invalid chromeVisibility.' }));
  }

  const preloadAhead = s['preloadAhead'];
  if (typeof preloadAhead !== 'number' || !Number.isFinite(preloadAhead) || preloadAhead < 0 || preloadAhead > 20) {
    return err(
      createAppError({ code: 'reader.settings.invalid', message: 'preloadAhead must be between 0 and 20.' }),
    );
  }

  const verticalGapPx = s['verticalGapPx'];
  if (
    typeof verticalGapPx !== 'number' ||
    !Number.isFinite(verticalGapPx) ||
    verticalGapPx < 0 ||
    verticalGapPx > 2000
  ) {
    return err(
      createAppError({
        code: 'reader.settings.invalid',
        message: 'verticalGapPx must be between 0 and 2000.',
      }),
    );
  }

  const minZoom = s['minZoom'];
  const maxZoom = s['maxZoom'];
  if (typeof minZoom !== 'number' || !Number.isFinite(minZoom) || minZoom < 0.25) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'minZoom is invalid.' }));
  }
  if (typeof maxZoom !== 'number' || !Number.isFinite(maxZoom) || maxZoom > 10) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'maxZoom is invalid.' }));
  }
  if (minZoom > maxZoom) {
    return err(
      createAppError({ code: 'reader.settings.invalid', message: 'minZoom cannot exceed maxZoom.' }),
    );
  }

  const doubleTapZoom = s['doubleTapZoom'];
  if (typeof doubleTapZoom !== 'number' || !Number.isFinite(doubleTapZoom) || doubleTapZoom < 1 || doubleTapZoom > 5) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'doubleTapZoom must be between 1 and 5.' }));
  }

  const pinchSensitivity = s['pinchSensitivity'];
  if (typeof pinchSensitivity !== 'number' || !Number.isFinite(pinchSensitivity) || pinchSensitivity <= 0 || pinchSensitivity > 5) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'pinchSensitivity must be between 0 and 5 (exclusive 0).' }));
  }

  const gestureSensitivity = s['gestureSensitivity'];
  if (typeof gestureSensitivity !== 'number' || !Number.isFinite(gestureSensitivity) || gestureSensitivity <= 0 || gestureSensitivity > 5) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'gestureSensitivity must be between 0 and 5 (exclusive 0).' }));
  }

  const brightness = s['brightness'];
  if (typeof brightness !== 'number' || !Number.isFinite(brightness) || brightness < 0 || brightness > 1) {
    return err(
      createAppError({ code: 'reader.settings.invalid', message: 'brightness must be between 0 and 1.' }),
    );
  }

  const backgroundColor = s['backgroundColor'];
  if (typeof backgroundColor !== 'string' || backgroundColor.length === 0) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'backgroundColor is required.' }));
  }

  if (typeof s['imageSmoothing'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'imageSmoothing must be boolean.' }));
  }

  if (typeof s['keepScreenOn'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'keepScreenOn must be boolean.' }));
  }

  if (typeof s['fullscreenOnOpen'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'fullscreenOnOpen must be boolean.' }));
  }

  const wheel = s['wheelBehavior'];
  if (typeof wheel !== 'string' || !WHEEL_BEHAVIORS.has(wheel as WheelBehavior)) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'Invalid wheelBehavior.' }));
  }

  if (typeof s['lowMemoryMode'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'lowMemoryMode must be boolean.' }));
  }

  if (typeof s['longStripOptimization'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'longStripOptimization must be boolean.' }));
  }

  if (typeof s['diagnosticsEnabled'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'diagnosticsEnabled must be boolean.' }));
  }

  if (typeof s['rememberPerTitleOverrides'] !== 'boolean') {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'rememberPerTitleOverrides must be boolean.' }));
  }

  const keyboardShortcuts = s['keyboardShortcuts'];
  if (!Array.isArray(keyboardShortcuts)) {
    return err(createAppError({ code: 'reader.settings.invalid', message: 'keyboardShortcuts must be an array.' }));
  }

  const settings: ReaderSettings = {
    readingMode: readingMode as ReadingMode,
    pageLayout: pageLayout as PageLayoutMode,
    fitMode: fitMode as FitMode,
    tapZoneLayout: tapZoneLayout as TapZoneLayout,
    tapZoneDebugOverlay: s['tapZoneDebugOverlay'] as boolean,
    navigationDirection: navDir as NavigationDirection,
    pageTransition: pageTransition as PageTransitionMode,
    chromeVisibility: chromeVisibility as ReaderChromeVisibility,
    preloadAhead,
    verticalGapPx,
    minZoom,
    maxZoom,
    doubleTapZoom,
    pinchSensitivity,
    gestureSensitivity,
    brightness,
    backgroundColor,
    imageSmoothing: s['imageSmoothing'] as boolean,
    keepScreenOn: s['keepScreenOn'] as boolean,
    fullscreenOnOpen: s['fullscreenOnOpen'] as boolean,
    wheelBehavior: wheel as WheelBehavior,
    keyboardShortcuts: keyboardShortcuts as readonly KeyboardShortcut[],
    longStripOptimization: s['longStripOptimization'] as boolean,
    lowMemoryMode: s['lowMemoryMode'] as boolean,
    diagnosticsEnabled: s['diagnosticsEnabled'] as boolean,
    rememberPerTitleOverrides: s['rememberPerTitleOverrides'] as boolean,
  };

  return ok(settings);
}
