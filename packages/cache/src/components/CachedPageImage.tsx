import { useEffect, useRef, useState } from 'react';
import type { ChapterId, MangaId, ProviderId } from '@app/shared';
import { cn } from '@app/design-system';

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
}: CachedPageImageProps) {
  const context = useCoverCacheContext();
  const [src, setSrc] = useState<string | undefined>(undefined);
  // The failure is tracked by request key, not a boolean: a new source must show
  // the loading placeholder again, and the effect may only touch state from its
  // async continuation. `src` is kept so the previous image stays on screen
  // until the new one resolves.
  const [failedRequest, setFailedRequest] = useState<string | null>(null);
  const objectUrlRef = useRef<string | undefined>(undefined);
  const requestKey = `${providerId}\u0000${mangaId}\u0000${chapterId}\u0000${String(pageIndex)}\u0000${remoteUrl}\u0000${retention}`;
  const failed = failedRequest === requestKey;

  useEffect(() => {
    if (context === null) return;

    let cancelled = false;

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
      });

      if (cancelled) {
        return;
      }

      if (result === undefined) {
        setFailedRequest(requestKey);
        setSrc(undefined);
        return;
      }

      if (objectUrlRef.current !== undefined && objectUrlRef.current !== result.objectUrl) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
      }

      objectUrlRef.current = result.objectUrl;
      setFailedRequest(null);
      setSrc(result.objectUrl);
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current !== undefined) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
    };
  }, [chapterId, context, mangaId, pageIndex, providerId, remoteUrl, requestKey, retention]);

  if (context === null || failed || src === undefined) {
    return (
      <div
        className={cn('animate-pulse bg-muted/80', (context === null || failed) && 'animate-none', className)}
        aria-hidden={alt === ''}
        role={alt === '' ? undefined : 'img'}
        aria-label={alt === '' ? undefined : alt}
      />
    );
  }

  return <img src={src} alt={alt} className={className} draggable={false} />;
}
