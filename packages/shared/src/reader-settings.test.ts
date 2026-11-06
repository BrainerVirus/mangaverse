import { describe, expect, it } from 'vitest';
import { defaultKeyboardShortcuts } from './keyboard-shortcuts';
import {
  getDefaultReaderSettings,
  normalizeTitleReaderOverrides,
  resolveReaderSettings,
  sanitizeReaderSettings,
  sanitizeReaderSettingsOverride,
  validateReaderSettings,
  validateReaderSettingsForBackup,
} from './reader-settings';

/** A global row as builds before #224 wrote it: every field, old ranges and all. */
const LEGACY_ROW = {
  readingMode: 'rtl',
  pageLayout: 'double',
  fitMode: 'height',
  tapZoneLayout: 'grid',
  tapZoneDebugOverlay: false,
  navigationDirection: 'default',
  pageTransition: 'fade',
  chromeVisibility: 'always',
  preloadAhead: 20,
  prefetchBudgetBytes: 100,
  verticalGapPx: 2000,
  minZoom: 1,
  maxZoom: 4,
  doubleTapZoom: 2,
  pinchSensitivity: 1,
  gestureSensitivity: 1,
  brightness: 0.4,
  backgroundColor: '#112233',
  imageSmoothing: false,
  keepScreenOn: false,
  fullscreenOnOpen: true,
  wheelBehavior: 'zoom',
  keyboardShortcuts: [],
  longStripOptimization: false,
  lowMemoryMode: true,
  diagnosticsEnabled: true,
  rememberPerTitleOverrides: false,
} as const;

describe('reader settings', () => {
  it('getDefaultReaderSettings returns stable defaults', () => {
    const d = getDefaultReaderSettings();
    expect(d.readingMode).toBe('auto');
    expect(d.pageLayout).toBe('auto');
    expect(d.fitMode).toBe('auto');
    expect(d.pageTransition).toBe('none');
    expect(d.preloadAhead).toBe(4);
    expect(d.preloadBehind).toBe(1);
    expect(d.verticalGapPx).toBe(0);
    expect(d.backgroundColor).toBe('#000000');
    expect(d.minZoom).toBe(1);
    expect(d.maxZoom).toBe(3);
    expect(d.doubleTapZoom).toBe(1.5);
    expect(d.tapZoneDebugOverlay).toBe(false);
    expect(d.chromeVisibility).toBe('auto');
    expect(d.gestureSensitivity).toBe(1);
    expect(d.longStripOptimization).toBe(true);
    expect(d.lowMemoryMode).toBe(false);
    expect(d).not.toHaveProperty('brightness');
    expect(d).not.toHaveProperty('rememberPerTitleOverrides');
    expect(validateReaderSettings(d).ok).toBe(true);
  });

  it('resolveReaderSettings merges overrides', () => {
    const base = getDefaultReaderSettings();
    const merged = resolveReaderSettings(base, { readingMode: 'rtl', preloadAhead: 4 });
    expect(merged.readingMode).toBe('rtl');
    expect(merged.preloadAhead).toBe(4);
    expect(merged.fitMode).toBe(base.fitMode);
  });

  it('validateReaderSettings rejects invalid preload and gap', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, preloadAhead: -1 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, preloadAhead: 25 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, verticalGapPx: -3 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, verticalGapPx: 5000 }).ok).toBe(false);
  });

  it('Given a value just past the UI range, When writing, Then it is rejected rather than clamped', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, verticalGapPx: 64 }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, verticalGapPx: 65 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, preloadAhead: 10 }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, preloadAhead: 11 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, preloadBehind: 10 }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, preloadBehind: 11 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, preloadBehind: -1 }).ok).toBe(false);
  });

  it('accepts auto for mode, layout and fit', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, readingMode: 'auto' }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, pageLayout: 'auto' }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, fitMode: 'auto' }).ok).toBe(true);
  });

  it('validateReaderSettings rejects invalid zoom bounds', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, minZoom: 5, maxZoom: 1 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, minZoom: 0.1 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, maxZoom: 20 }).ok).toBe(false);
  });

  it('validateReaderSettings rejects invalid doubleTapZoom and pinchSensitivity', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, doubleTapZoom: 0.5 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, doubleTapZoom: 6 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, pinchSensitivity: 0 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, pinchSensitivity: 6 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, gestureSensitivity: 0 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, gestureSensitivity: 6 }).ok).toBe(false);
  });

  it('validateReaderSettings validates reading mode enums', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, readingMode: 'rtl' }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, readingMode: 'vertical' }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, readingMode: 'paged' }).ok).toBe(false);
  });

  it('validateReaderSettings validates boolean fields', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, lowMemoryMode: 'yes' }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, keepScreenOn: 1 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, longStripOptimization: 'yes' }).ok).toBe(false);
  });

  it('validateReaderSettings validates chrome visibility', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, chromeVisibility: 'always' }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, chromeVisibility: 'sometimes' }).ok).toBe(false);
  });

  it('validateReaderSettings rejects malformed keyboard shortcuts', () => {
    const base = getDefaultReaderSettings();
    const shortcut = { action: 'nextPage', key: 'ArrowRight' };

    expect(validateReaderSettings({ ...base, keyboardShortcuts: 'ArrowRight' }).ok).toBe(false);
    expect(
      validateReaderSettings({ ...base, keyboardShortcuts: [{ ...shortcut, key: 5 }] }).ok,
    ).toBe(false);
    expect(
      validateReaderSettings({ ...base, keyboardShortcuts: [{ action: 'nextPage' }] }).ok,
    ).toBe(false);
    expect(validateReaderSettings({ ...base, keyboardShortcuts: [shortcut] }).ok).toBe(false);

    const complete = defaultKeyboardShortcuts('ltr').map((binding) =>
      binding.action === 'nextPage' ? { ...binding, key: 'n', modifiers: ['Shift'] } : binding,
    );
    const valid = validateReaderSettings({ ...base, keyboardShortcuts: complete });
    expect(valid.ok).toBe(true);
    expect(valid.ok ? valid.value.keyboardShortcuts[0] : undefined).toEqual({
      action: 'nextPage',
      key: 'n',
      modifiers: ['Shift'],
    });
  });

  it('Given legacy or free-form shortcuts, When sanitizing, Then unrelated settings survive', () => {
    const stored = {
      ...getDefaultReaderSettings(),
      readingMode: 'rtl' as const,
      doubleTapZoom: 2.5,
      keyboardShortcuts: [
        { action: 'teleport', key: 'x' },
        { action: 'nextPage', key: 'Tab' },
      ],
    };

    const settings = sanitizeReaderSettings(stored);

    expect(settings.readingMode).toBe('rtl');
    expect(settings.doubleTapZoom).toBe(2.5);
    expect(settings.keyboardShortcuts).toEqual([]);

    const partial = sanitizeReaderSettings({
      ...getDefaultReaderSettings(),
      readingMode: 'vertical' as const,
      keyboardShortcuts: [{ action: 'nextPage', key: 'n' }],
    });
    expect(partial.readingMode).toBe('vertical');
    expect(partial.keyboardShortcuts).toEqual([]);
  });

  it('Given a row written before shortcuts existed, When sanitizing, Then defaults fill the list', () => {
    const { keyboardShortcuts: _omitted, ...legacy } = getDefaultReaderSettings();

    const settings = sanitizeReaderSettings(legacy);

    expect(settings.readingMode).toBe('auto');
    expect(settings.keyboardShortcuts).toEqual([]);
  });

  it('Given a pre-#224 row, When reading it, Then every saved value survives and legacy ranges clamp', () => {
    const settings = sanitizeReaderSettings(LEGACY_ROW);

    expect(settings).toMatchObject({
      readingMode: 'rtl',
      pageLayout: 'double',
      fitMode: 'height',
      pageTransition: 'fade',
      chromeVisibility: 'always',
      backgroundColor: '#112233',
      maxZoom: 4,
      lowMemoryMode: true,
      prefetchBudgetBytes: 100,
      verticalGapPx: 64,
      preloadAhead: 10,
      // Missing from the row: the field default, not a reset of the row.
      preloadBehind: 1,
    });
    expect(settings).not.toHaveProperty('brightness');
    expect(settings).not.toHaveProperty('rememberPerTitleOverrides');
  });

  it('Given one field that no longer parses, When reading, Then only that field falls back', () => {
    const settings = sanitizeReaderSettings({ ...LEGACY_ROW, readingMode: 'paged', minZoom: 0 });

    expect(settings.readingMode).toBe('auto');
    expect(settings.minZoom).toBe(1);
    expect(settings.pageLayout).toBe('double');
    expect(settings.backgroundColor).toBe('#112233');
  });

  it('Given salvaged zoom bounds that contradict, When reading, Then the zoom pair resets together', () => {
    const settings = sanitizeReaderSettings({ ...LEGACY_ROW, minZoom: 5, maxZoom: 'big' });

    expect(settings.minZoom).toBe(1);
    expect(settings.maxZoom).toBe(3);
    expect(settings.readingMode).toBe('rtl');
  });

  it('Given a row saved before spread offset, wide pages, strip width, page number and transition existed, When reading, Then each reads its default', () => {
    const settings = sanitizeReaderSettings(LEGACY_ROW);
    const validated = validateReaderSettings({ ...LEGACY_ROW, verticalGapPx: 0, preloadAhead: 4 });

    const added = {
      spreadOffset: 0,
      widePageMode: 'isolate',
      maxStripWidthPercent: 100,
      showPageNumber: true,
      showChapterTransition: true,
    };
    expect(settings).toMatchObject(added);
    expect(validated.ok ? validated.value : undefined).toMatchObject(added);
    expect(getDefaultReaderSettings()).toMatchObject(added);
  });

  it('Given a row saved before data saver and the tiling threshold existed, When reading, Then they read Off and Auto', () => {
    const added = { dataSaver: false, tilingThreshold: 'auto' };

    expect(sanitizeReaderSettings(LEGACY_ROW)).toMatchObject(added);
    expect(getDefaultReaderSettings()).toMatchObject(added);
    const validated = validateReaderSettings({ ...LEGACY_ROW, verticalGapPx: 0, preloadAhead: 4 });
    expect(validated.ok ? validated.value : undefined).toMatchObject(added);
  });

  it('Given data saver or a tiling threshold, When writing, Then only the documented values are accepted', () => {
    const base = getDefaultReaderSettings();

    expect(validateReaderSettings({ ...base, dataSaver: true }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, dataSaver: 'on' }).ok).toBe(false);
    for (const tilingThreshold of ['auto', 4096, 8192, 16_384]) {
      expect(validateReaderSettings({ ...base, tilingThreshold }).ok).toBe(true);
    }
    for (const tilingThreshold of [0, 2048, 8191, '8192', 'huge']) {
      const result = validateReaderSettings({ ...base, tilingThreshold });
      expect(result.ok ? undefined : result.error.message).toBe(
        'tilingThreshold must be auto, 4096, 8192 or 16384.',
      );
    }
    expect(
      sanitizeReaderSettings({ ...base, tilingThreshold: 3000, dataSaver: true }),
    ).toMatchObject({
      tilingThreshold: 'auto',
      dataSaver: true,
    });
    expect(sanitizeReaderSettingsOverride({ tilingThreshold: 4096, dataSaver: 'x' })).toEqual({
      tilingThreshold: 4096,
    });
  });

  it('Given a row saved before display downscale existed, When reading, Then it reads Auto', () => {
    const validated = validateReaderSettings({ ...LEGACY_ROW, verticalGapPx: 0, preloadAhead: 4 });

    expect(getDefaultReaderSettings().displayDownscale).toBe('auto');
    expect(sanitizeReaderSettings(LEGACY_ROW).displayDownscale).toBe('auto');
    expect(validated.ok ? validated.value.displayDownscale : undefined).toBe('auto');
  });

  it('Given a display downscale value, When writing, Then only Auto and Off are accepted', () => {
    const base = getDefaultReaderSettings();

    for (const displayDownscale of ['auto', 'off']) {
      expect(validateReaderSettings({ ...base, displayDownscale }).ok).toBe(true);
    }
    for (const displayDownscale of ['on', 2048, true, null]) {
      const result = validateReaderSettings({ ...base, displayDownscale });
      expect(result.ok ? undefined : result.error.message).toBe('Invalid displayDownscale.');
    }
    expect(
      sanitizeReaderSettings({ ...base, displayDownscale: 'half', readingMode: 'rtl' }),
    ).toMatchObject({ displayDownscale: 'auto', readingMode: 'rtl' });
    expect(sanitizeReaderSettingsOverride({ displayDownscale: 'off' })).toEqual({
      displayDownscale: 'off',
    });
    expect(sanitizeReaderSettingsOverride({ displayDownscale: 4096 })).toEqual({});
  });

  it('Given a row saved before the next-chapter threshold existed, When reading, Then it reads 25', () => {
    const validated = validateReaderSettings({ ...LEGACY_ROW, verticalGapPx: 0, preloadAhead: 4 });

    expect(getDefaultReaderSettings().nextChapterThresholdPercent).toBe(25);
    expect(sanitizeReaderSettings(LEGACY_ROW).nextChapterThresholdPercent).toBe(25);
    expect(validated.ok ? validated.value.nextChapterThresholdPercent : undefined).toBe(25);
  });

  it('Given a next-chapter threshold, When writing, Then only whole percentages from 0 to 100 are accepted', () => {
    const base = getDefaultReaderSettings();

    for (const nextChapterThresholdPercent of [0, 25, 100]) {
      expect(validateReaderSettings({ ...base, nextChapterThresholdPercent }).ok).toBe(true);
    }
    for (const nextChapterThresholdPercent of [-1, 101, 12.5, '25', Number.NaN]) {
      const result = validateReaderSettings({ ...base, nextChapterThresholdPercent });
      expect(result.ok ? undefined : result.error.message).toBe(
        'nextChapterThresholdPercent must be a whole number between 0 and 100.',
      );
    }
    expect(sanitizeReaderSettings({ ...base, nextChapterThresholdPercent: 250 })).toMatchObject({
      nextChapterThresholdPercent: 25,
    });
    expect(
      sanitizeReaderSettingsOverride({ nextChapterThresholdPercent: 60, tilingThreshold: 'x' }),
    ).toEqual({ nextChapterThresholdPercent: 60 });
  });

  it('Given one of the new fields no longer parses, When reading, Then only that field falls back', () => {
    const settings = sanitizeReaderSettings({
      ...LEGACY_ROW,
      spreadOffset: 2,
      widePageMode: 'halve',
      maxStripWidthPercent: 80,
      showPageNumber: false,
      showChapterTransition: 'off',
    });

    expect(settings).toMatchObject({
      spreadOffset: 0,
      widePageMode: 'isolate',
      maxStripWidthPercent: 80,
      showPageNumber: false,
      showChapterTransition: true,
      readingMode: 'rtl',
      backgroundColor: '#112233',
    });
  });

  it('Given a spread offset or strip width outside its range, When writing, Then it is rejected', () => {
    const base = getDefaultReaderSettings();

    expect(validateReaderSettings({ ...base, spreadOffset: 1 }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, spreadOffset: 2 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, maxStripWidthPercent: 40 }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, maxStripWidthPercent: 39 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, maxStripWidthPercent: 101 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, maxStripWidthPercent: 80.5 }).ok).toBe(false);
    expect(validateReaderSettings({ ...base, showPageNumber: 'no' }).ok).toBe(false);
    expect(sanitizeReaderSettingsOverride({ spreadOffset: 1, maxStripWidthPercent: 20 })).toEqual({
      spreadOffset: 1,
    });
  });

  it('Given a wide page mode, When writing, Then isolate and split pass and anything else is rejected', () => {
    const base = getDefaultReaderSettings();

    expect(base.widePageMode).toBe('isolate');
    expect(validateReaderSettings({ ...base, widePageMode: 'split' }).ok).toBe(true);
    const invalid = validateReaderSettings({ ...base, widePageMode: 'halve' });
    expect(invalid.ok ? undefined : invalid.error.message).toBe('Invalid widePageMode.');
    expect(sanitizeReaderSettingsOverride({ widePageMode: 'split' })).toEqual({
      widePageMode: 'split',
    });
    expect(sanitizeReaderSettingsOverride({ widePageMode: 'halve' })).toEqual({});
  });

  it('Given a legacy backup, When validating it for restore, Then it clamps instead of failing', () => {
    const result = validateReaderSettingsForBackup(LEGACY_ROW);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toMatchObject({
      verticalGapPx: 64,
      preloadAhead: 10,
      preloadBehind: 1,
      readingMode: 'rtl',
    });
    expect(validateReaderSettingsForBackup({ ...LEGACY_ROW, verticalGapPx: -1 }).ok).toBe(false);
  });

  it('Given a stored title diff, When sanitizing, Then known valid fields survive and legacy ranges clamp', () => {
    expect(
      sanitizeReaderSettingsOverride({
        readingMode: 'rtl',
        verticalGapPx: 500,
        brightness: 0.2,
        rememberPerTitleOverrides: true,
        fitMode: 'sideways',
      }),
    ).toEqual({ readingMode: 'rtl', verticalGapPx: 64 });
    expect(sanitizeReaderSettingsOverride(null)).toEqual({});
  });

  it('Given title choices, When normalizing the row, Then values equal to global inherit except concrete presentation', () => {
    const global = { ...getDefaultReaderSettings(), readingMode: 'ltr' as const };

    expect(
      normalizeTitleReaderOverrides(global, {
        readingMode: 'ltr',
        pageLayout: 'auto',
        verticalGapPx: 0,
        preloadAhead: 6,
      }),
    ).toEqual({ readingMode: 'ltr', preloadAhead: 6 });
    expect(
      normalizeTitleReaderOverrides({ ...global, readingMode: 'rtl' }, { readingMode: 'auto' }),
    ).toEqual({ readingMode: 'auto' });
  });
});
