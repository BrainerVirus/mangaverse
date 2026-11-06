import { describe, expect, it } from 'vitest';
import { getDefaultReaderSettings } from '@app/shared';

import { resolveDisplayMaxEdge } from './display-downscale.js';
import { toReaderEngineSettings } from './to-reader-engine-settings.js';

describe('resolveDisplayMaxEdge', () => {
  it('Given Auto, When resolved, Then page images are capped at a 2048px long edge', () => {
    expect(resolveDisplayMaxEdge('auto')).toBe(2048);
    expect(resolveDisplayMaxEdge(undefined)).toBe(2048);
  });

  it('Given Off, When resolved, Then page images keep their original size', () => {
    expect(resolveDisplayMaxEdge('off')).toBeUndefined();
  });

  it('Given saved settings, When mapped to the engine, Then the engine carries the resolved cap', () => {
    const settings = getDefaultReaderSettings();

    expect(toReaderEngineSettings(settings).displayMaxEdgePx).toBe(2048);
    expect(
      toReaderEngineSettings({ ...settings, displayDownscale: 'off' }).displayMaxEdgePx,
    ).toBeUndefined();
  });
});
