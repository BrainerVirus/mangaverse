import type { DesktopPlatformBridge } from '@app/platform';
import type { DesktopDataHostBridge } from './data-host-bridge.js';

declare global {
  interface Window {
    readonly mangaversePlatform: DesktopPlatformBridge;
    readonly mangaverseDataHost: DesktopDataHostBridge;
  }
}

export {};
