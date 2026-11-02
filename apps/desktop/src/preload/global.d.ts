import type { DesktopPlatformBridge } from '@app/platform';
import type { AppResult } from '@app/shared';

declare global {
  interface Window {
    readonly mangaversePlatform: DesktopPlatformBridge;
    /** See data-host-bridge.ts: the port arrives as a window message after `connect`. */
    readonly mangaverseDataHost: { connect(): Promise<AppResult<void>> };
  }
}

export {};
