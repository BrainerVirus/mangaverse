import { createElectronPlatformAdapter } from './electron.js';
import type { DesktopPlatformBridge, PlatformAdapter } from './types.js';
import { createWebPlatformAdapter } from './web.js';

function readDesktopBridge(): DesktopPlatformBridge | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  const candidate = (globalThis as { mangaversePlatform?: DesktopPlatformBridge }).mangaversePlatform;
  if (candidate === undefined || typeof candidate.getCapabilities !== 'function') {
    return undefined;
  }

  return candidate;
}

/** Resolves Electron IPC bridge when present, otherwise web platform APIs. */
export function createAppPlatformAdapter(): PlatformAdapter {
  const bridge = readDesktopBridge();
  if (bridge !== undefined) {
    return createElectronPlatformAdapter(bridge);
  }

  return createWebPlatformAdapter();
}
