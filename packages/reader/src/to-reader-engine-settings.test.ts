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
  });
});
