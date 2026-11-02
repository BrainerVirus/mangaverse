import {
  createElectronPlatformAdapter,
  createWebPlatformAdapter,
  type DesktopPlatformBridge,
  type PlatformAdapter,
} from '@app/platform';

function readDesktopBridge(): DesktopPlatformBridge | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  const candidate = (globalThis as { mangaversePlatform?: DesktopPlatformBridge })
    .mangaversePlatform;
  if (candidate === undefined || typeof candidate.getCapabilities !== 'function') {
    return undefined;
  }

  return candidate;
}

/** Whether this page runs inside the desktop shell's preload bridge. */
export function hasDesktopBridge(): boolean {
  return readDesktopBridge() !== undefined;
}

export function createAppPlatformAdapter(): PlatformAdapter {
  const bridge = readDesktopBridge();
  if (bridge !== undefined) {
    return createElectronPlatformAdapter(bridge);
  }

  return createWebPlatformAdapter();
}
