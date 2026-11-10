import { describe, expect, it } from 'vitest';
import { TITLE_BAR_HEIGHT } from '@app/platform';
import {
  DEFAULT_TITLE_BAR_COLORS,
  windowChromeOptions,
  windowChromePlatform,
} from './window-chrome.js';

describe('windowChromeOptions', () => {
  it('Given macOS, Then the title bar is hidden and the traffic lights sit centred in the strip', () => {
    const options = windowChromeOptions('darwin');
    expect(options.titleBarStyle).toBe('hidden');
    expect(options.titleBarOverlay).toBeUndefined();
    const y = options.trafficLightPosition!.y;
    // 14px lights, centred in the strip.
    expect(y * 2 + 14).toBeGreaterThanOrEqual(TITLE_BAR_HEIGHT - 1);
    expect(y * 2 + 14).toBeLessThanOrEqual(TITLE_BAR_HEIGHT + 1);
    expect(options.trafficLightPosition!.x).toBeGreaterThan(0);
    expect(options.backgroundColor).toBe(DEFAULT_TITLE_BAR_COLORS.color);
  });

  it.each(['win32', 'linux', 'freebsd'] as const)(
    'Given %s, Then the controls are an overlay at the strip height in the default colours',
    (platform) => {
      const options = windowChromeOptions(platform);
      expect(options.titleBarStyle).toBe('hidden');
      expect(options.trafficLightPosition).toBeUndefined();
      expect(options.titleBarOverlay).toEqual({
        color: '#fafafa',
        symbolColor: '#1a1a1a',
        height: TITLE_BAR_HEIGHT,
      });
      expect(options.backgroundColor).toBe('#fafafa');
    },
  );
});

describe('windowChromePlatform', () => {
  it('names macOS and Windows, and treats every other desktop as Linux', () => {
    expect(windowChromePlatform('darwin')).toBe('darwin');
    expect(windowChromePlatform('win32')).toBe('win32');
    expect(windowChromePlatform('linux')).toBe('linux');
    expect(windowChromePlatform('openbsd')).toBe('linux');
  });
});
