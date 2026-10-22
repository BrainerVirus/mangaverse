import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ChapterId, MangaId, ProviderId } from '@app/shared';
import { Button, cn } from '@app/design-system';

import { resolvePageObjectUrl } from '../page-cache-store.js';
import { useCoverCacheContext } from './CoverCacheProvider.js';

export interface CachedPageImageProps {
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly chapterId: ChapterId | string;
  readonly pageIndex: number;
  readonly remoteUrl: string;
  readonly alt?: string;
  readonly className?: string;
  readonly retention?: 'read' | 'normal';
  readonly onSkip?: (() => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly onLoad?: ((size: { width: number; height: number }) => void) | undefined;
}

export function CachedPageImage({
  providerId,
  mangaId,
  chapterId,
  pageIndex,
  remoteUrl,
  alt = '',
  className,
  retention = 'read',
  onSkip,
  onBack,
  onLoad,
}: CachedPageImageProps) {
  const context = useCoverCacheContext();
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setFailed(false);
    setSrc(undefined);
    setAttempt((value) => value + 1);
  };
  const retryOnReconnect = useEffectEvent(() => {
    if (failed) retry();
  });
  const objectUrlRef = useRef<string | undefined>(undefined);
  const requestKey = `${providerId}\u0000${mangaId}\u0000${chapterId}\u0000${String(pageIndex)}\u0000${remoteUrl}\u0000${retention}`;

  // A new source (or a new cache context) clears an earlier failure during
  // render: the effect below may only touch state from its async continuation
  // (react/set-state-in-effect), and `src` is kept so the previous image stays
  // on screen until the new one resolves.
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

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: resolving the page blob is an IndexedDB + network call keyed by props, with cancellation on cleanup; no event or derived value can start it
  useEffect(() => {
    if (context === null) return;

    let cancelled = false;

    const recoverOnline = () => {
      if (!cancelled) retryOnReconnect();
    };
    window.addEventListener('online', recoverOnline);
    void (async () => {
      const result = await resolvePageObjectUrl({
        db: context.db,
        adapter: context.adapter,
        providerId,
        mangaId,
        chapterId,
        pageIndex,
        remoteUrl,
        retention,
        refresh: attempt > 0 && navigator.onLine,
      });

      if (cancelled) {
        if (result !== undefined)
          void context.adapter.blobStorage.revokeObjectUrl(result.objectUrl);
        return;
      }

      if (result === undefined) {
        setFailed(true);
        setSrc(undefined);
        return;
      }

      if (objectUrlRef.current !== undefined && objectUrlRef.current !== result.objectUrl) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
      }

      objectUrlRef.current = result.objectUrl;
      setSrc(result.objectUrl);
    })().catch(() => {
      if (!cancelled) {
        setFailed(true);
        setSrc(undefined);
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
  }, [attempt, chapterId, context, mangaId, pageIndex, providerId, remoteUrl, retention]);

  if (failed) {
    return (
      <div
        className={cn(
          'flex min-h-40 flex-col items-center justify-center gap-3 bg-background p-4 text-foreground',
          className,
        )}
        role="alert"
        onPointerUp={(event) => event.stopPropagation()}
      >
        <p>Could not load page {pageIndex + 1}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={retry}>Retry</Button>
          {onSkip ? (
            <Button variant="outline" onClick={onSkip}>
              Skip page
            </Button>
          ) : null}
          {onBack ? (
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (context === null || failed || src === undefined) {
    return (
      <div
        className={cn(
          'animate-pulse bg-muted/80',
          (context === null || failed) && 'animate-none',
          className,
        )}
        aria-hidden={alt === ''}
        role={alt === '' ? undefined : 'img'}
        aria-label={alt === '' ? undefined : alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={false}
      onError={() => setFailed(true)}
      onLoad={(event) =>
        onLoad?.({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
    />
  );
}
