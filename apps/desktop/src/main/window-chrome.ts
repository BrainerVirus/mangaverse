import { titleBarHeight, type WindowChromePlatform } from '@app/platform';
import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * The light theme's canvas and ink: what the overlay and the window paint before the renderer's
 * theme applies and sends its own colours.
 */
export const DEFAULT_TITLE_BAR_COLORS = { color: '#fafafa', symbolColor: '#1a1a1a' } as const;

/**
 * The traffic lights' box is 14px tall and sits 12px from the left edge, the standard 28px title
 * bar's inset. Left unset, Electron reports no position (`getWindowButtonPosition()` is `null`),
 * so the position is explicit: centred in the strip, and checkable.
 */
const TRAFFIC_LIGHT_SIZE = 14;
const TRAFFIC_LIGHT_INSET_X = 12;

/** macOS and Windows are themselves; every other desktop draws the Linux overlay. */
export function windowChromePlatform(platform: NodeJS.Platform): WindowChromePlatform {
  if (platform === 'darwin' || platform === 'win32') return platform;
  return 'linux';
}

/**
 * The native title bar gives way to the app's own strip on every desktop. macOS keeps its traffic
 * lights, centred in the strip; Windows and Linux keep their window controls as an overlay drawn
 * at the strip's height in the theme's colours.
 */
export function windowChromeOptions(
  platform: NodeJS.Platform,
): Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'titleBarOverlay' | 'trafficLightPosition' | 'backgroundColor'
> {
  const chromePlatform = windowChromePlatform(platform);
  const height = titleBarHeight(chromePlatform);
  if (chromePlatform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: {
        x: TRAFFIC_LIGHT_INSET_X,
        y: Math.round((height - TRAFFIC_LIGHT_SIZE) / 2),
      },
      backgroundColor: DEFAULT_TITLE_BAR_COLORS.color,
    };
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...DEFAULT_TITLE_BAR_COLORS, height },
    backgroundColor: DEFAULT_TITLE_BAR_COLORS.color,
  };
}
