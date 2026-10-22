import { z } from 'zod';

import { isReservedShortcutKey, keyboardShortcutId } from './keyboard-shortcuts.js';
import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';

/** Default chapter prefetch budget: 250 MB. */
export const PREFETCH_BUDGET_DEFAULT_BYTES = 250 * 1024 * 1024;

/** Upper bound for a finite prefetch budget: 2 GiB. */
export const PREFETCH_BUDGET_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const readingModeSchema = z.enum(['rtl', 'ltr', 'vertical'], {
  error: 'Invalid readingMode.',
});

const pageLayoutSchema = z.enum(['single', 'double', 'smartSpread'], {
  error: 'Invalid pageLayout.',
});

const fitModeSchema = z.enum(['width', 'height', 'contain', 'cover', 'original'], {
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

const readerSettingsSchema = z
  .object(
    {
      readingMode: readingModeSchema,
      pageLayout: pageLayoutSchema,
      fitMode: fitModeSchema,
      tapZoneLayout: tapZoneLayoutSchema,
      tapZoneDebugOverlay: z.boolean({ error: 'tapZoneDebugOverlay must be boolean.' }),
      navigationDirection: navigationDirectionSchema,
      pageTransition: pageTransitionSchema,
      chromeVisibility: chromeVisibilitySchema,
      /** Number of upcoming pages to speculatively preload. */
      preloadAhead: z
        .number({ error: 'preloadAhead must be between 0 and 20.' })
        .min(0, { error: 'preloadAhead must be between 0 and 20.' })
        .max(20, { error: 'preloadAhead must be between 0 and 20.' }),
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
        .number({ error: 'verticalGapPx must be between 0 and 2000.' })
        .min(0, { error: 'verticalGapPx must be between 0 and 2000.' })
        .max(2000, { error: 'verticalGapPx must be between 0 and 2000.' }),
      minZoom: z
        .number({ error: 'minZoom is invalid.' })
        .min(0.25, { error: 'minZoom is invalid.' }),
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
      /** Relative brightness between 0 (dim) and 1 (full). */
      brightness: z
        .number({ error: 'brightness must be between 0 and 1.' })
        .min(0, { error: 'brightness must be between 0 and 1.' })
        .max(1, { error: 'brightness must be between 0 and 1.' }),
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
      diagnosticsEnabled: z.boolean({ error: 'diagnosticsEnabled must be boolean.' }),
      rememberPerTitleOverrides: z.boolean({
        error: 'rememberPerTitleOverrides must be boolean.',
      }),
      // Last so a malformed array is reported after the scalar fields, as before.
      keyboardShortcuts: keyboardShortcutListSchema,
    },
    { error: 'Reader settings must be an object.' },
  )
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
    prefetchBudgetBytes: PREFETCH_BUDGET_DEFAULT_BYTES,
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
 * Backup restore stays strict on every scalar field but accepts pre-PR free-form
 * shortcut lists: an invalid or partial list restores as the default bindings
 * instead of rejecting the whole backup.
 */
export function validateReaderSettingsForBackup(input: unknown): AppResult<ReaderSettings> {
  const strict = validateReaderSettings(input);
  if (strict.ok) return strict;
  if (typeof input !== 'object' || input === null) return strict;

  const { keyboardShortcuts: _stored, ...fields } = input as Record<string, unknown>;
  const fieldResult = readerSettingsSchema.safeParse({ ...fields, keyboardShortcuts: [] });
  if (!fieldResult.success) return strict;
  return ok({ ...fieldResult.data, keyboardShortcuts: [] });
}

/**
 * Reads settings that may predate the shortcut schema. Only a shortcut failure
 * is salvaged: old rows keep every unrelated preference and fall back to the
 * default shortcuts instead of losing their reading mode, zoom or layout.
 */
export function sanitizeReaderSettings(input: unknown): ReaderSettings {
  const parsed = readerSettingsSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (typeof input !== 'object' || input === null) return getDefaultReaderSettings();

  const { keyboardShortcuts: storedShortcuts, ...fields } = input as Record<string, unknown>;
  const fieldResult = readerSettingsSchema.safeParse({ ...fields, keyboardShortcuts: [] });
  if (!fieldResult.success) return getDefaultReaderSettings();

  const shortcutResult = keyboardShortcutListSchema.safeParse(storedShortcuts);
  return {
    ...fieldResult.data,
    keyboardShortcuts: shortcutResult.success ? shortcutResult.data : [],
  };
}
