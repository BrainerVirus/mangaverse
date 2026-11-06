import { z } from 'zod';

import { isReservedShortcutKey, keyboardShortcutId } from './keyboard-shortcuts.js';
import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';

/** Default chapter prefetch budget: 250 MB. */
export const PREFETCH_BUDGET_DEFAULT_BYTES = 250 * 1024 * 1024;

/** Upper bound for a finite prefetch budget: 2 GiB. */
export const PREFETCH_BUDGET_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Upper bound of the preload windows, in pages; older rows saved up to 20. */
export const READER_PRELOAD_MAX = 10;

/** Upper bound of the strip gap, in pixels; older rows saved up to 2000. */
export const READER_STRIP_GAP_MAX = 64;

/** Narrowest explicit strip width, as a percentage of the reader. */
export const READER_STRIP_WIDTH_MIN_PERCENT = 40;

/** A strip width of 100% means Auto: full width on phones, bounded on desktop. */
export const READER_STRIP_WIDTH_AUTO_PERCENT = 100;

/**
 * `auto` lets the reader decide from the title, the page shapes and the
 * provider metadata (spec R6); the other values are explicit choices.
 */
const readingModeSchema = z.enum(['auto', 'rtl', 'ltr', 'vertical'], {
  error: 'Invalid readingMode.',
});

const pageLayoutSchema = z.enum(['auto', 'single', 'double', 'smartSpread'], {
  error: 'Invalid pageLayout.',
});

const fitModeSchema = z.enum(['auto', 'width', 'height', 'contain', 'cover', 'original'], {
  error: 'Invalid fitMode.',
});

const tapZoneLayoutSchema = z.enum(['leftRight', 'lShaped', 'grid'], {
  error: 'Invalid tapZoneLayout.',
});

const pageTransitionSchema = z.enum(['none', 'fade', 'slide'], {
  error: 'Invalid pageTransition.',
});

const navigationDirectionSchema = z.enum(['default', 'inverted'], {
  error: 'Invalid navigationDirection.',
});

const wheelBehaviorSchema = z.enum(['none', 'scroll', 'zoom'], {
  error: 'Invalid wheelBehavior.',
});

const chromeVisibilitySchema = z.enum(['auto', 'always', 'hidden'], {
  error: 'Invalid chromeVisibility.',
});

const keyboardShortcutActionSchema = z.enum(
  [
    'nextPage',
    'prevPage',
    'firstPage',
    'lastPage',
    'nextChapter',
    'prevChapter',
    'toggleChrome',
    'toggleFullscreen',
  ],
  { error: 'Unknown shortcut action.' },
);

const keyboardShortcutSchema = z.object(
  {
    action: keyboardShortcutActionSchema,
    key: z
      .string({ error: 'Shortcut key must be a string.' })
      .min(1, { error: 'Shortcut key must not be empty.' })
      .refine((key) => !isReservedShortcutKey(key), {
        error: 'Escape and Tab are reserved by the reader.',
      }),
    modifiers: z
      .array(z.enum(['Control', 'Alt', 'Shift', 'Meta'], { error: 'Unknown shortcut modifier.' }), {
        error: 'Shortcut modifiers must be an array.',
      })
      .exactOptional(),
  },
  { error: 'Each keyboard shortcut must be an object.' },
);

/**
 * A saved list is either empty (the direction-aware defaults apply) or a full
 * binding set: a partial list would silently mix custom and built-in bindings,
 * and duplicates would make the reader's key resolution order-dependent.
 */
const keyboardShortcutListSchema = z.preprocess(
  (value) => value ?? [],
  z
    .array(keyboardShortcutSchema, { error: 'keyboardShortcuts must be an array.' })
    .superRefine((shortcuts, ctx) => {
      const actions = new Set<KeyboardShortcutAction>();
      const bindings = new Set<string>();
      shortcuts.forEach((shortcut, index) => {
        if (actions.has(shortcut.action)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Each shortcut action can be bound only once.',
            path: [index, 'action'],
          });
        }
        actions.add(shortcut.action);
        const id = keyboardShortcutId(shortcut);
        if (bindings.has(id)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Each shortcut key can be bound only once.',
            path: [index, 'key'],
          });
        }
        bindings.add(id);
      });
      if (shortcuts.length > 0 && actions.size !== keyboardShortcutActionSchema.options.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'Every shortcut action must be bound.',
          path: [],
        });
      }
    }),
);

const prefetchBudgetBytesMessage = `prefetchBudgetBytes must be 0 (unlimited) or between 1 and ${PREFETCH_BUDGET_MAX_BYTES}.`;

const prefetchBudgetBytesSchema = z
  .number({ error: prefetchBudgetBytesMessage })
  .int({ error: prefetchBudgetBytesMessage })
  .min(0, { error: prefetchBudgetBytesMessage })
  .max(PREFETCH_BUDGET_MAX_BYTES, { error: prefetchBudgetBytesMessage });

const preloadMessage = (field: string) => `${field} must be between 0 and ${READER_PRELOAD_MAX}.`;

function preloadCountSchema(field: string) {
  return z
    .number({ error: preloadMessage(field) })
    .min(0, { error: preloadMessage(field) })
    .max(READER_PRELOAD_MAX, { error: preloadMessage(field) });
}

const verticalGapMessage = `verticalGapPx must be between 0 and ${READER_STRIP_GAP_MAX}.`;

const stripWidthMessage = `maxStripWidthPercent must be a whole number between ${READER_STRIP_WIDTH_MIN_PERCENT} and ${READER_STRIP_WIDTH_AUTO_PERCENT}.`;

const spreadOffsetSchema = z.union([z.literal(0), z.literal(1)], {
  error: 'spreadOffset must be 0 or 1.',
});

const widePageModeSchema = z.enum(['isolate', 'split'], {
  error: 'Invalid widePageMode.',
});

/** The explicit tall-page tiling thresholds, in CSS pixels; `auto` is the reader's own choice. */
export const READER_TILING_THRESHOLDS = [4096, 8192, 16384] as const;

const tilingThresholdSchema = z.union(
  [z.literal('auto'), z.literal(4096), z.literal(8192), z.literal(16384)],
  { error: 'tilingThreshold must be auto, 4096, 8192 or 16384.' },
);

const readerSettingsFields = {
  readingMode: readingModeSchema,
  pageLayout: pageLayoutSchema,
  fitMode: fitModeSchema,
  tapZoneLayout: tapZoneLayoutSchema,
  tapZoneDebugOverlay: z.boolean({ error: 'tapZoneDebugOverlay must be boolean.' }),
  navigationDirection: navigationDirectionSchema,
  pageTransition: pageTransitionSchema,
  chromeVisibility: chromeVisibilitySchema,
  /** Number of upcoming pages to speculatively preload. */
  preloadAhead: preloadCountSchema('preloadAhead'),
  /** Pages kept warm behind the active one; rows saved before it existed read the default. */
  preloadBehind: preloadCountSchema('preloadBehind').default(1),
  /**
   * Maximum bytes of newly downloaded pages to prefetch per chapter.
   * 0 means unlimited; otherwise the allowed range is 1 byte–2 GiB.
   */
  prefetchBudgetBytes: z.preprocess(
    (value) => value ?? PREFETCH_BUDGET_DEFAULT_BYTES,
    prefetchBudgetBytesSchema,
  ),
  /** Vertical gap between strips in vertical mode (px). */
  verticalGapPx: z
    .number({ error: verticalGapMessage })
    .min(0, { error: verticalGapMessage })
    .max(READER_STRIP_GAP_MAX, { error: verticalGapMessage }),
  minZoom: z.number({ error: 'minZoom is invalid.' }).min(0.25, { error: 'minZoom is invalid.' }),
  maxZoom: z.number({ error: 'maxZoom is invalid.' }).max(10, { error: 'maxZoom is invalid.' }),
  /** Default zoom level after a double-tap (e.g. 1.5 = 150%). */
  doubleTapZoom: z
    .number({ error: 'doubleTapZoom must be between 1 and 5.' })
    .min(1, { error: 'doubleTapZoom must be between 1 and 5.' })
    .max(5, { error: 'doubleTapZoom must be between 1 and 5.' }),
  /** Pinch zoom sensitivity multiplier. */
  pinchSensitivity: z
    .number({ error: 'pinchSensitivity must be between 0 and 5 (exclusive 0).' })
    .positive({ error: 'pinchSensitivity must be between 0 and 5 (exclusive 0).' })
    .max(5, { error: 'pinchSensitivity must be between 0 and 5 (exclusive 0).' }),
  /** General gesture sensitivity multiplier for tap, pan, and navigation thresholds. */
  gestureSensitivity: z
    .number({ error: 'gestureSensitivity must be between 0 and 5 (exclusive 0).' })
    .positive({ error: 'gestureSensitivity must be between 0 and 5 (exclusive 0).' })
    .max(5, { error: 'gestureSensitivity must be between 0 and 5 (exclusive 0).' }),
  /** CSS color for reader background. */
  backgroundColor: z
    .string({ error: 'backgroundColor is required.' })
    .min(1, { error: 'backgroundColor is required.' }),
  /** Whether images use browser smoothing/filtering. */
  imageSmoothing: z.boolean({ error: 'imageSmoothing must be boolean.' }),
  keepScreenOn: z.boolean({ error: 'keepScreenOn must be boolean.' }),
  fullscreenOnOpen: z.boolean({ error: 'fullscreenOnOpen must be boolean.' }),
  wheelBehavior: wheelBehaviorSchema,
  longStripOptimization: z.boolean({ error: 'longStripOptimization must be boolean.' }),
  lowMemoryMode: z.boolean({ error: 'lowMemoryMode must be boolean.' }),
  /**
   * A manual switch (metered-connection detection is unverified): only the page
   * being read loads, with no preload, prefetch or decode-ahead.
   */
  dataSaver: z.boolean({ error: 'dataSaver must be boolean.' }).default(false),
  /**
   * A strip page taller than this many pixels is split into tiles. `auto` is
   * the reader's value (8192px today).
   */
  tilingThreshold: tilingThresholdSchema.default('auto'),
  diagnosticsEnabled: z.boolean({ error: 'diagnosticsEnabled must be boolean.' }),
  /**
   * Spread alignment in double layouts: 0 shows the first page alone as a
   * cover, 1 pairs from the first page ("offset by one").
   */
  spreadOffset: spreadOffsetSchema.default(0),
  /**
   * A landscape page in double layouts takes a spread of its own: `isolate`
   * shows it as one page, `split` fills the spread with its two halves.
   */
  widePageMode: widePageModeSchema.default('isolate'),
  /** Strip width as a percentage of the reader; 100 is Auto. */
  maxStripWidthPercent: z
    .number({ error: stripWidthMessage })
    .int({ error: stripWidthMessage })
    .min(READER_STRIP_WIDTH_MIN_PERCENT, { error: stripWidthMessage })
    .max(READER_STRIP_WIDTH_AUTO_PERCENT, { error: stripWidthMessage })
    .default(READER_STRIP_WIDTH_AUTO_PERCENT),
  showPageNumber: z.boolean({ error: 'showPageNumber must be boolean.' }).default(true),
  /** Whether reaching the chapter end opens the transition screen. */
  showChapterTransition: z
    .boolean({ error: 'showChapterTransition must be boolean.' })
    .default(true),
  // Last so a malformed array is reported after the scalar fields, as before.
  keyboardShortcuts: keyboardShortcutListSchema,
};

type ReaderSettingsKey = keyof typeof readerSettingsFields;

const READER_SETTINGS_KEYS = Object.keys(readerSettingsFields) as ReaderSettingsKey[];

// Unknown keys are stripped, so rows that still carry `brightness` or
// `rememberPerTitleOverrides` parse without them.
const readerSettingsSchema = z
  .object(readerSettingsFields, { error: 'Reader settings must be an object.' })
  .superRefine((settings, ctx) => {
    if (settings.minZoom > settings.maxZoom) {
      ctx.addIssue({
        code: 'custom',
        message: 'minZoom cannot exceed maxZoom.',
        path: ['maxZoom'],
      });
    }
  });

export type ReadingMode = z.infer<typeof readingModeSchema>;

export type PageLayoutMode = z.infer<typeof pageLayoutSchema>;

export type FitMode = z.infer<typeof fitModeSchema>;

export type TapZoneLayout = z.infer<typeof tapZoneLayoutSchema>;

export type PageTransitionMode = z.infer<typeof pageTransitionSchema>;

export type NavigationDirection = z.infer<typeof navigationDirectionSchema>;

export type WheelBehavior = z.infer<typeof wheelBehaviorSchema>;

export type ReaderChromeVisibility = z.infer<typeof chromeVisibilitySchema>;

export type SpreadOffset = z.infer<typeof spreadOffsetSchema>;

export type WidePageMode = z.infer<typeof widePageModeSchema>;

export type TilingThreshold = z.infer<typeof tilingThresholdSchema>;

export type KeyboardShortcut = z.infer<typeof keyboardShortcutSchema>;

export type KeyboardShortcutAction = z.infer<typeof keyboardShortcutActionSchema>;

type ReaderSettingsShape = z.infer<typeof readerSettingsSchema>;

/** Keeps the historical public shape, where the shortcut list is read-only. */
export type ReaderSettings = Readonly<
  Omit<ReaderSettingsShape, 'keyboardShortcuts'> & {
    readonly keyboardShortcuts: readonly KeyboardShortcut[];
  }
>;

export type ReaderSettingsOverride = Partial<ReaderSettings>;

/** The settings whose `auto` value the reader resolves per chapter (spec R6). */
export const READER_AUTO_SETTING_KEYS = ['readingMode', 'pageLayout', 'fitMode'] as const;

/**
 * Defaults for a reader that has never saved settings. Saved rows hold every
 * field, so changing a default never rewrites what a user already has.
 */
export function getDefaultReaderSettings(): ReaderSettings {
  return {
    readingMode: 'auto',
    pageLayout: 'auto',
    fitMode: 'auto',
    tapZoneLayout: 'leftRight',
    tapZoneDebugOverlay: false,
    navigationDirection: 'default',
    pageTransition: 'none',
    chromeVisibility: 'auto',
    preloadAhead: 4,
    preloadBehind: 1,
    prefetchBudgetBytes: PREFETCH_BUDGET_DEFAULT_BYTES,
    verticalGapPx: 0,
    minZoom: 1,
    maxZoom: 3,
    doubleTapZoom: 1.5,
    pinchSensitivity: 1,
    gestureSensitivity: 1,
    backgroundColor: '#000000',
    imageSmoothing: true,
    keepScreenOn: true,
    fullscreenOnOpen: false,
    wheelBehavior: 'scroll',
    keyboardShortcuts: [],
    longStripOptimization: true,
    lowMemoryMode: false,
    dataSaver: false,
    tilingThreshold: 'auto',
    diagnosticsEnabled: false,
    spreadOffset: 0,
    widePageMode: 'isolate',
    maxStripWidthPercent: READER_STRIP_WIDTH_AUTO_PERCENT,
    showPageNumber: true,
    showChapterTransition: true,
  };
}

export function resolveReaderSettings(
  globalSettings: ReaderSettings,
  overrides: ReaderSettingsOverride | undefined,
): ReaderSettings {
  if (overrides === undefined) return globalSettings;
  return { ...globalSettings, ...overrides };
}

/** The wider ranges older builds saved, mapped onto today's bounds. */
const LEGACY_UPPER_BOUNDS: Readonly<Partial<Record<ReaderSettingsKey, number>>> = {
  preloadAhead: READER_PRELOAD_MAX,
  verticalGapPx: READER_STRIP_GAP_MAX,
};

/**
 * Stored values above today's slider range (a 2000px gap, 20 pages of preload)
 * read as the range's top instead of invalidating the row.
 */
function clampLegacyBounds(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const clamped: Record<string, unknown> = { ...input };
  for (const [key, max] of Object.entries(LEGACY_UPPER_BOUNDS)) {
    const value = clamped[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > max) clamped[key] = max;
  }
  return clamped;
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** Writes stay strict: a value outside the UI's range is rejected, not clamped. */
export function validateReaderSettings(input: unknown): AppResult<ReaderSettings> {
  const result = readerSettingsSchema.safeParse(input);
  if (result.success) return ok(result.data);

  return err(
    createAppError({
      code: 'reader.settings.invalid',
      message: result.error.issues[0]?.message ?? 'Invalid reader settings.',
    }),
  );
}

/**
 * Backup restore stays strict on every scalar field but reads older backups:
 * legacy ranges clamp to today's bounds, and an invalid or partial shortcut
 * list restores as the default bindings instead of rejecting the whole backup.
 */
export function validateReaderSettingsForBackup(input: unknown): AppResult<ReaderSettings> {
  if (!isRecord(input)) return validateReaderSettings(input);
  const clamped = clampLegacyBounds(input);
  const strict = validateReaderSettings(clamped);
  if (strict.ok) return strict;

  const { keyboardShortcuts: _stored, ...fields } = clamped;
  const fieldResult = readerSettingsSchema.safeParse({ ...fields, keyboardShortcuts: [] });
  if (!fieldResult.success) return strict;
  return ok({ ...fieldResult.data, keyboardShortcuts: [] });
}

/**
 * Reads a stored row. Legacy ranges clamp, a missing field reads its default,
 * and a field that no longer parses falls back alone: one bad value never
 * resets the reading mode, zoom or layout the row also holds.
 */
export function sanitizeReaderSettings(input: unknown): ReaderSettings {
  if (!isRecord(input)) return getDefaultReaderSettings();
  const clamped = clampLegacyBounds(input);
  const parsed = readerSettingsSchema.safeParse(clamped);
  if (parsed.success) return parsed.data;

  const defaults = getDefaultReaderSettings() as Readonly<Record<ReaderSettingsKey, unknown>>;
  const salvaged: Record<string, unknown> = {};
  for (const key of READER_SETTINGS_KEYS) {
    const field = readerSettingsFields[key].safeParse(clamped[key]);
    salvaged[key] = field.success ? field.data : defaults[key];
  }
  const settings = salvaged as ReaderSettings;
  if (settings.minZoom > settings.maxZoom) {
    return { ...settings, minZoom: defaults.minZoom, maxZoom: defaults.maxZoom } as ReaderSettings;
  }
  return settings;
}

/**
 * Reads a stored per-title diff: only known fields that still parse survive,
 * with the same legacy clamping as a full row.
 */
export function sanitizeReaderSettingsOverride(input: unknown): ReaderSettingsOverride {
  if (!isRecord(input)) return {};
  const clamped = clampLegacyBounds(input);
  const override: Record<string, unknown> = {};
  for (const key of READER_SETTINGS_KEYS) {
    if (clamped[key] === undefined) continue;
    const field = readerSettingsFields[key].safeParse(clamped[key]);
    if (field.success) override[key] = field.data;
  }
  return override as ReaderSettingsOverride;
}

/**
 * The per-title row a set of title choices stores. A value equal to the global
 * one inherits it, except a concrete mode, layout or fit: those beat Auto's
 * page-shape and metadata inference, so "LTR for this title" must stay
 * recorded even while the global value is also LTR.
 */
export function normalizeTitleReaderOverrides(
  global: ReaderSettings,
  overrides: ReaderSettingsOverride,
): ReaderSettingsOverride {
  const autoKeys: ReadonlySet<string> = new Set(READER_AUTO_SETTING_KEYS);
  const stored = Object.entries(overrides).filter(([key, value]) => {
    if (value === undefined || !(key in readerSettingsFields)) return false;
    if (autoKeys.has(key) && value !== 'auto') return true;
    return JSON.stringify(value) !== JSON.stringify(global[key as keyof ReaderSettings]);
  });
  return Object.fromEntries(stored) as ReaderSettingsOverride;
}
