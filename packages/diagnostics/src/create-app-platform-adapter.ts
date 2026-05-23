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

  const candidate = (globalThis as { mangaversePlatform?: DesktopPlatformBridge }).mangaversePlatform;
  if (candidate === undefined || typeof candidate.getCapabilities !== 'function') {
    return undefined;
  }

  return candidate;
}

export function createAppPlatformAdapter(): PlatformAdapter {
  const bridge = readDesktopBridge();
  if (bridge !== undefined) {
    return createElectronPlatformAdapter(bridge);
  }

  return createWebPlatformAdapter();
}
