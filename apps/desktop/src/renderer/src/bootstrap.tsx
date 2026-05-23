import { detectElectronCapabilities, type PlatformCapabilities } from '@app/platform';

export function detectDesktopCapabilities(): PlatformCapabilities {
  return detectElectronCapabilities();
}
