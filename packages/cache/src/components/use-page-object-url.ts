import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ChapterId, MangaId, ProviderId } from '@app/shared';

import { resolvePageObjectUrl } from '../page-cache-store.js';
import {
  acquirePageObjectUrl,
  releasePageObjectUrl,
  type PageObjectUrlInput as RegistryPageObjectUrlInput,
} from '../page-object-url-registry.js';
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
  /** Display downscale cap in pixels; absent shows the stored page as is. */
  readonly maxDisplayEdge?: number | undefined;
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
  const loadRef = useRef<PageLoadState>({
    startedAt: 0,
    fromCache: false,
    byteSize: 0,
    reported: false,
  });
  const requestKey = `${String(input.providerId)}\u0000${String(input.mangaId)}\u0000${String(input.chapterId)}\u0000${String(input.pageIndex)}\u0000${input.remoteUrl}\u0000${input.retention}\u0000${String(input.maxDisplayEdge)}`;
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

    // A retry asks the network for fresh bytes, so it owns a private URL; every
    // normal mount shares the page's registered URL with the decode pool and
    // with any other holder, and releases its reference on unmount.
    const isRetry = attempt > 0 && navigator.onLine;
    let release: (() => void) | undefined;

    const recoverOnline = () => {
      if (cancelled || !failedRef.current) return;
      failedRef.current = false;
      setFailed(false);
      setSrc(undefined);
      setAttempt((current) => current + 1);
    };
    window.addEventListener('online', recoverOnline);
    void (async () => {
      const pageInput: RegistryPageObjectUrlInput = {
        db: context.db,
        adapter: context.adapter,
        providerId: input.providerId,
        mangaId: input.mangaId,
        chapterId: input.chapterId,
        pageIndex: input.pageIndex,
        remoteUrl: input.remoteUrl,
        retention: input.retention,
        maxDisplayEdge: input.maxDisplayEdge,
      };
      const result = isRetry
        ? await resolvePageObjectUrl({ ...pageInput, refresh: true })
        : await acquirePageObjectUrl(pageInput);

      if (cancelled) {
        if (result !== undefined) {
          if (isRetry) void context.adapter.blobStorage.revokeObjectUrl(result.objectUrl);
          else void releasePageObjectUrl(pageInput);
        }
        return;
      }

      if (result === undefined) {
        failedRef.current = true;
        setFailed(true);
        setSrc(undefined);
        emitFailure();
        return;
      }

      release = isRetry
        ? () => {
            void context.adapter.blobStorage.revokeObjectUrl(result.objectUrl);
          }
        : () => {
            void releasePageObjectUrl(pageInput);
          };

      loadRef.current.fromCache = result.fromCache;
      loadRef.current.byteSize = result.byteSize;
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
      release?.();
      release = undefined;
    };
  }, [
    attempt,
    context,
    input.chapterId,
    input.mangaId,
    input.maxDisplayEdge,
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
