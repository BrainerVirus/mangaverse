import type { DesktopPlatformBridge } from '@app/platform';

declare global {
  interface Window {
    readonly mangaversePlatform: DesktopPlatformBridge;
  }
}

export {};
