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
 * on return keeps a long chapter readable after a tab switch. Unsupported
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

    const request = () => {
      if (disposed || document.visibilityState !== 'visible' || sentinel !== null) return;
      void wakeLock
        .request('screen')
        .then((lock) => {
          if (disposed) {
            void lock.release();
            return;
          }
          sentinel = lock;
        })
        .catch(() => undefined);
    };
    const handleVisibility = () => {
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
      document.removeEventListener('visibilitychange', handleVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [enabled]);
}
