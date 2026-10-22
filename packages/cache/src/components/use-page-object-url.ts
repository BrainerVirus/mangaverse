import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ChapterId, MangaId, ProviderId } from '@app/shared';

import { resolvePageObjectUrl } from '../page-cache-store.js';
import type { CoverCacheContextValue } from './CoverCacheProvider.js';
import type { CachedPageImageMetric } from './CachedPageImage.js';

export interface PageObjectUrlInput {
  readonly context: CoverCacheContextValue | null;
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly chapterId: ChapterId | string;
  readonly pageIndex: number;
  readonly remoteUrl: string;
  readonly retention: 'read' | 'normal';
  readonly onMetric?: ((metric: CachedPageImageMetric) => void) | undefined;
}

interface PageLoadState {
  startedAt: number;
  fromCache: boolean;
  byteSize: number;
  reported: boolean;
}

/** Builds at most one metric per load attempt; retries reset the state. */
function takePageMetric(
  state: PageLoadState,
  status: 'loaded' | 'failed',
): CachedPageImageMetric | undefined {
  if (state.reported) return undefined;
  state.reported = true;
  return {
    status,
    durationMs: Math.max(0, performance.now() - state.startedAt),
    fromCache: status === 'loaded' ? state.fromCache : false,
    byteSize: status === 'loaded' ? state.byteSize : 0,
  };
}

/**
 * Resolves the page blob and owns its object URL. Extracted from the image
 * component so the cache/network/retry branches stay independently readable.
 */
export function usePageObjectUrl(input: PageObjectUrlInput): {
  readonly src: string | undefined;
  readonly failed: boolean;
  readonly retry: () => void;
  readonly reportLoaded: () => void;
  readonly reportFailed: () => void;
} {
  const context = input.context;
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failedRef = useRef(false);
  const objectUrlRef = useRef<string | undefined>(undefined);
  const loadRef = useRef<PageLoadState>({
    startedAt: 0,
    fromCache: false,
    byteSize: 0,
    reported: false,
  });
  const requestKey = `${String(input.providerId)}\u0000${String(input.mangaId)}\u0000${String(input.chapterId)}\u0000${String(input.pageIndex)}\u0000${input.remoteUrl}\u0000${input.retention}`;
  const [resetKey, setResetKey] = useState<{ readonly context: unknown; readonly request: string }>(
    {
      context,
      request: requestKey,
    },
  );
  if (resetKey.context !== context || resetKey.request !== requestKey) {
    setResetKey({ context, request: requestKey });
    setFailed(false);
  }

  const emitFailure = useEffectEvent(() => {
    const metric = takePageMetric(loadRef.current, 'failed');
    if (metric !== undefined) input.onMetric?.(metric);
  });

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: resolving the page blob is an IndexedDB + network call keyed by props, with cancellation on cleanup; no event or derived value can start it
  useEffect(() => {
    if (context === null) return;

    let cancelled = false;
    loadRef.current = {
      startedAt: performance.now(),
      fromCache: false,
      byteSize: 0,
      reported: false,
    };

    const recoverOnline = () => {
      if (cancelled || !failedRef.current) return;
      failedRef.current = false;
      setFailed(false);
      setSrc(undefined);
      setAttempt((current) => current + 1);
    };
    window.addEventListener('online', recoverOnline);
    void (async () => {
      const result = await resolvePageObjectUrl({
        db: context.db,
        adapter: context.adapter,
        providerId: input.providerId,
        mangaId: input.mangaId,
        chapterId: input.chapterId,
        pageIndex: input.pageIndex,
        remoteUrl: input.remoteUrl,
        retention: input.retention,
        refresh: attempt > 0 && navigator.onLine,
      });

      if (cancelled) {
        if (result !== undefined)
          void context.adapter.blobStorage.revokeObjectUrl(result.objectUrl);
        return;
      }

      if (result === undefined) {
        failedRef.current = true;
        setFailed(true);
        setSrc(undefined);
        emitFailure();
        return;
      }

      if (objectUrlRef.current !== undefined && objectUrlRef.current !== result.objectUrl) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
      }

      loadRef.current.fromCache = result.fromCache;
      loadRef.current.byteSize = result.byteSize;
      objectUrlRef.current = result.objectUrl;
      setSrc(result.objectUrl);
    })().catch(() => {
      if (!cancelled) {
        failedRef.current = true;
        setFailed(true);
        setSrc(undefined);
        emitFailure();
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('online', recoverOnline);
      if (objectUrlRef.current !== undefined) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
    };
  }, [
    attempt,
    context,
    input.chapterId,
    input.mangaId,
    input.pageIndex,
    input.providerId,
    input.remoteUrl,
    input.retention,
  ]);

  return {
    src,
    failed,
    retry: () => {
      failedRef.current = false;
      setFailed(false);
      setSrc(undefined);
      setAttempt((value) => value + 1);
    },
    reportLoaded: () => {
      const metric = takePageMetric(loadRef.current, 'loaded');
      if (metric !== undefined) input.onMetric?.(metric);
    },
    reportFailed: () => {
      failedRef.current = true;
      setFailed(true);
      const metric = takePageMetric(loadRef.current, 'failed');
      if (metric !== undefined) input.onMetric?.(metric);
    },
  };
}
