import { useCallback, useEffect, useRef } from 'react';

function fullscreenSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.fullscreenEnabled &&
    document.documentElement.requestFullscreen !== undefined
  );
}

function exitFullscreen(): void {
  if (document.fullscreenElement === null) return;
  void document.exitFullscreen().catch(() => undefined);
}

/**
 * Automatic fullscreen on reader open, when the setting asks for it. Browsers
 * only grant the request while the opening navigation still carries user
 * activation; a refusal is final and leaves the reader in the window, where the
 * chrome's Maximize button is still available. Reduced motion skips the
 * automatic takeover (a full-screen surface change is exactly the kind of
 * context shift the preference asks us to avoid) but the manual button remains.
 *
 * The returned toggle is the manual chrome/keyboard action. Both paths mark the
 * fullscreen as reader-owned, so closing the reader exits only a fullscreen it
 * opened, never one the user already had.
 */
export function useReaderFullscreen({
  openOnEnter,
  reducedMotion,
}: {
  readonly openOnEnter: boolean;
  readonly reducedMotion: boolean;
}): { readonly toggleFullscreen: () => void } {
  const ownedRef = useRef(false);
  const aliveRef = useRef(true);

  const enter = useCallback((): Promise<boolean> => {
    if (!fullscreenSupported()) return Promise.resolve(false);
    return document.documentElement.requestFullscreen().then(
      () => true,
      () => false,
    );
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement !== null) {
      ownedRef.current = false;
      exitFullscreen();
      return;
    }
    void enter().then((entered) => {
      if (!entered) return;
      if (!aliveRef.current) {
        exitFullscreen();
        return;
      }
      ownedRef.current = true;
    });
  }, [enter]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the Fullscreen API and its user-activation/permission lifecycle
  useEffect(() => {
    if (!openOnEnter || reducedMotion) return;

    let disposed = false;
    void enter().then((entered) => {
      if (!entered) return;
      if (disposed) {
        if (document.fullscreenElement !== null)
          void document.exitFullscreen().catch(() => undefined);
        return;
      }
      ownedRef.current = true;
    });

    return () => {
      disposed = true;
      if (!ownedRef.current) return;
      ownedRef.current = false;
      exitFullscreen();
    };
  }, [enter, openOnEnter, reducedMotion]);

  // Closing the reader must also leave a fullscreen the manual toggle opened.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: releases the reader-owned Fullscreen API entry on unmount
  useEffect(
    () => () => {
      aliveRef.current = false;
      if (!ownedRef.current) return;
      ownedRef.current = false;
      exitFullscreen();
    },
    [],
  );

  return { toggleFullscreen };
}
