import { useEffect } from 'react';

/**
 * Automatic fullscreen on reader open, when the setting asks for it. Browsers
 * only grant the request while the opening navigation still carries user
 * activation; a refusal is final and leaves the reader in the window, where the
 * chrome's Maximize button is still available. Reduced motion skips the
 * automatic takeover (a full-screen surface change is exactly the kind of
 * context shift the preference asks us to avoid) but the manual button remains.
 */
export function useReaderFullscreen(enabled: boolean, reducedMotion: boolean): void {
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the Fullscreen API and its user-activation/permission lifecycle
  useEffect(() => {
    if (!enabled || reducedMotion || typeof document === 'undefined') return;
    if (!document.fullscreenEnabled || document.documentElement.requestFullscreen === undefined) {
      return;
    }

    let disposed = false;
    let owned = false;
    void document.documentElement
      .requestFullscreen()
      .then(() => {
        owned = true;
        if (disposed && document.fullscreenElement !== null) {
          void document.exitFullscreen().catch(() => undefined);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (owned && document.fullscreenElement !== null) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [enabled, reducedMotion]);
}
