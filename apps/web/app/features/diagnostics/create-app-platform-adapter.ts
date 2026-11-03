import {
  createElectronPlatformAdapter,
  createWebPlatformAdapter,
  type DesktopPlatformBridge,
  type PlatformAdapter,
  type ProviderNetworkRefusal,
} from '@app/platform';
import { createAppError } from '@app/shared';

import { feedback } from '../../lib/app-feedback.js';

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

/**
 * A refused web request has no main-process log and no caller that can tell an
 * undeclared-host refusal from a failed download, so record it in the app's
 * event log. The host is logged, never the full URL, which may carry a token.
 */
function reportProviderNetworkRefusal(refusal: ProviderNetworkRefusal): void {
  feedback.log(
    createAppError({
      code: 'platform.invalid-url',
      message: `Refused ${refusal.kind} request from ${refusal.providerId} to ${refusal.host} (${refusal.reason}).`,
      details: {
        kind: refusal.kind,
        providerId: refusal.providerId,
        host: refusal.host,
        reason: refusal.reason,
      },
    }),
    'provider-network.refused',
  );
}

export function createAppPlatformAdapter(): PlatformAdapter {
  const bridge = readDesktopBridge();
  if (bridge !== undefined) {
    return createElectronPlatformAdapter(bridge);
  }

  return createWebPlatformAdapter({ onProviderRequestRefused: reportProviderNetworkRefusal });
}
