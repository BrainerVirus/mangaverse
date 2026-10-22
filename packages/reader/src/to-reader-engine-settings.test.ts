import { describe, expect, it } from 'vitest';
import { getDefaultReaderSettings } from '@app/shared';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';

describe('toReaderEngineSettings', () => {
  it('maps shared reader settings into engine settings', () => {
    const settings = getDefaultReaderSettings();
    const engine = toReaderEngineSettings(settings);

    expect(engine.readingMode).toBe(settings.readingMode);
    expect(engine.pageLayout).toBe(settings.pageLayout);
    expect(engine.preloadAhead).toBe(settings.preloadAhead);
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
});
