import { describe, expect, it } from 'vitest';
import { getDefaultReaderSettings } from '@app/shared';
import { toReaderEngineSettings, withAutoStripDecision } from './to-reader-engine-settings.js';

describe('toReaderEngineSettings', () => {
  it('maps shared reader settings into engine settings', () => {
    const settings = { ...getDefaultReaderSettings(), readingMode: 'rtl' as const };
    const engine = toReaderEngineSettings(settings);

    expect(engine.readingMode).toBe('rtl');
    expect(engine.preloadAhead).toBe(settings.preloadAhead);
    expect(engine.preloadBehind).toBe(settings.preloadBehind);
    expect(engine.treatFirstPageAsCover).toBe(true);
    expect(engine.pageTransition).toBe(settings.pageTransition);
    expect(engine.pinchSensitivity).toBe(settings.pinchSensitivity);
    expect(engine.imageSmoothing).toBe(settings.imageSmoothing);
    expect(engine.keepScreenOn).toBe(settings.keepScreenOn);
    expect(engine.fullscreenOnOpen).toBe(settings.fullscreenOnOpen);
    expect(engine.longStripOptimization).toBe(settings.longStripOptimization);
    expect(engine.diagnosticsEnabled).toBe(settings.diagnosticsEnabled);
    expect(engine.keyboardShortcuts).toEqual(settings.keyboardShortcuts);
  });

  it('Given a spread offset, When mapped, Then cover alone is the cover flag and offset by one clears it', () => {
    const settings = getDefaultReaderSettings();

    expect(toReaderEngineSettings({ ...settings, spreadOffset: 0 }).treatFirstPageAsCover).toBe(
      true,
    );
    expect(toReaderEngineSettings({ ...settings, spreadOffset: 1 }).treatFirstPageAsCover).toBe(
      false,
    );
    expect(toReaderEngineSettings({ ...settings, maxStripWidthPercent: 80 })).toMatchObject({
      maxStripWidthPercent: 80,
    });
  });

  it('Given a wide page mode, When mapped, Then the engine carries it with isolate by default', () => {
    const settings = getDefaultReaderSettings();

    expect(toReaderEngineSettings(settings).widePageMode).toBe('isolate');
    expect(toReaderEngineSettings({ ...settings, widePageMode: 'split' }).widePageMode).toBe(
      'split',
    );
  });

  it('Given data saver, When mapped, Then the session and scroll window preload nothing', () => {
    const settings = { ...getDefaultReaderSettings(), preloadAhead: 6, preloadBehind: 3 };

    expect(toReaderEngineSettings(settings)).toMatchObject({ preloadAhead: 6, preloadBehind: 3 });
    expect(toReaderEngineSettings({ ...settings, dataSaver: true })).toMatchObject({
      preloadAhead: 0,
      preloadBehind: 0,
    });
  });

  it('Given a next-chapter threshold, When mapped, Then the engine carries the percentage', () => {
    const settings = getDefaultReaderSettings();

    expect(toReaderEngineSettings(settings).nextChapterThresholdPercent).toBe(25);
    expect(
      toReaderEngineSettings({ ...settings, nextChapterThresholdPercent: 80 })
        .nextChapterThresholdPercent,
    ).toBe(80);
  });

  it('Given a tiling threshold, When mapped, Then the engine carries it in pixels with Auto at 8192', () => {
    const settings = getDefaultReaderSettings();

    expect(toReaderEngineSettings(settings).tilingThresholdPx).toBe(8192);
    expect(toReaderEngineSettings({ ...settings, tilingThreshold: 4096 }).tilingThresholdPx).toBe(
      4096,
    );
    expect(
      toReaderEngineSettings({ ...settings, tilingThreshold: 16_384, lowMemoryMode: true })
        .tilingThresholdPx,
    ).toBe(16_384);
    expect(toReaderEngineSettings({ ...settings, lowMemoryMode: true }).tilingThresholdPx).toBe(
      8192,
    );
  });

  it('Given the default Auto settings, When mapped without context, Then the engine gets paged LTR, single, fit screen', () => {
    const engine = toReaderEngineSettings(getDefaultReaderSettings());

    expect(engine).toMatchObject({ readingMode: 'ltr', pageLayout: 'single', fitMode: 'contain' });
  });

  it('Given a title Auto merged over a concrete global mode, When mapped, Then the global mode applies', () => {
    const global = { ...getDefaultReaderSettings(), readingMode: 'rtl' as const };
    const merged = { ...global, readingMode: 'auto' as const };
    const engine = toReaderEngineSettings(merged, {
      globalSettings: global,
      titleOverrides: { readingMode: 'auto' },
    });

    expect(engine.readingMode).toBe('rtl');
  });

  it('Given a landscape viewport, When Auto layout is mapped, Then the engine shows spreads', () => {
    const engine = toReaderEngineSettings(getDefaultReaderSettings(), {
      viewport: { orientation: 'landscape' },
    });

    expect(engine.pageLayout).toBe('double');
  });
});

describe('withAutoStripDecision', () => {
  it('Given a paged engine, When the strip decision applies, Then Auto fit becomes fit-width and a concrete fit is kept', () => {
    const engine = toReaderEngineSettings({ ...getDefaultReaderSettings(), readingMode: 'rtl' });
    expect(engine).toMatchObject({ readingMode: 'rtl', fitMode: 'contain' });

    expect(withAutoStripDecision(engine, 'auto')).toMatchObject({
      readingMode: 'vertical',
      fitMode: 'width',
    });
    expect(withAutoStripDecision(engine, 'contain')).toMatchObject({
      readingMode: 'vertical',
      fitMode: 'contain',
    });
    expect(withAutoStripDecision(engine, 'cover').fitMode).toBe('cover');
  });
});
