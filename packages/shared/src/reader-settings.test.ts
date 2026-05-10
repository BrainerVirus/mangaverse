import { describe, expect, it } from 'vitest';
import {
  getDefaultReaderSettings,
  resolveReaderSettings,
  validateReaderSettings,
} from './reader-settings';

describe('reader settings', () => {
  it('getDefaultReaderSettings returns stable defaults', () => {
    const d = getDefaultReaderSettings();
    expect(d.readingMode).toBe('ltr');
    expect(d.preloadAhead).toBe(2);
    expect(d.verticalGapPx).toBe(8);
    expect(d.minZoom).toBe(1);
    expect(d.maxZoom).toBe(3);
    expect(d.doubleTapZoom).toBe(1.5);
    expect(d.tapZoneDebugOverlay).toBe(false);
    expect(d.chromeVisibility).toBe('auto');
    expect(d.gestureSensitivity).toBe(1);
    expect(d.longStripOptimization).toBe(true);
    expect(d.lowMemoryMode).toBe(false);
    expect(d.rememberPerTitleOverrides).toBe(true);
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
    expect(validateReaderSettings({ ...base, rememberPerTitleOverrides: 1 }).ok).toBe(false);
  });

  it('validateReaderSettings validates chrome visibility', () => {
    const base = getDefaultReaderSettings();
    expect(validateReaderSettings({ ...base, chromeVisibility: 'always' }).ok).toBe(true);
    expect(validateReaderSettings({ ...base, chromeVisibility: 'sometimes' }).ok).toBe(false);
  });
});
