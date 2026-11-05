import { describe, expect, it } from 'vitest';
import { getDefaultReaderSettings } from '@app/shared';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';

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
