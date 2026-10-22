import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

function screenWakeLock(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null;
  const lock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return lock ?? null;
}

/**
 * Keeps the display awake while the reader is open, where the Screen Wake Lock
 * API exists. The platform releases the lock when the page hides; re-requesting
 * on return keeps a long chapter readable after a tab switch. A hide/visible
 * flip while a request is in flight invalidates that request: its late sentinel
 * is released instead of being adopted as the current lock. Unsupported
 * browsers and rejected requests are silent: this is an enhancement, not a
 * reading requirement.
 */
export function useScreenWakeLock(enabled: boolean): void {
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the Screen Wake Lock API and its visibility lifecycle
  useEffect(() => {
    if (!enabled) return;
    const wakeLock = screenWakeLock();
    if (wakeLock === null) return;

    let disposed = false;
    let sentinel: WakeLockSentinelLike | null = null;
    let pending = false;
    /** Bumped on every visibility change, invalidating requests from the old state. */
    let generation = 0;

    const request = () => {
      if (disposed || pending || sentinel !== null || document.visibilityState !== 'visible')
        return;
      const requestGeneration = generation;
      pending = true;
      void wakeLock.request('screen').then(
        (lock) => {
          pending = false;
          if (
            disposed ||
            requestGeneration !== generation ||
            document.visibilityState !== 'visible'
          ) {
            void lock.release().catch(() => undefined);
            // The user came back while the old request was in flight: take a
            // fresh lock now instead of leaving the reader without one.
            if (!disposed && requestGeneration !== generation) request();
            return;
          }
          sentinel = lock;
        },
        () => {
          pending = false;
          if (!disposed && requestGeneration !== generation) request();
        },
      );
    };
    const handleVisibility = () => {
      generation += 1;
      if (document.visibilityState === 'hidden') {
        const current = sentinel;
        sentinel = null;
        void current?.release().catch(() => undefined);
        return;
      }
      request();
    };

    request();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      disposed = true;
      generation += 1;
      document.removeEventListener('visibilitychange', handleVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [enabled]);
}
