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
  const [failed, setFailed] = useState(false);
  const objectUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (context === null) {
      setSrc(undefined);
      setFailed(true);
      return;
    }

    let cancelled = false;
    setFailed(false);

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
        setFailed(true);
        setSrc(undefined);
        return;
      }

      if (objectUrlRef.current !== undefined && objectUrlRef.current !== result.objectUrl) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
      }

      objectUrlRef.current = result.objectUrl;
      setSrc(result.objectUrl);
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current !== undefined) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
    };
  }, [chapterId, context, mangaId, pageIndex, providerId, remoteUrl, retention]);

  if (failed || src === undefined) {
    return (
      <div
        className={cn('animate-pulse bg-muted/80', failed && 'animate-none', className)}
        aria-hidden={alt === ''}
        role={alt === '' ? undefined : 'img'}
        aria-label={alt === '' ? undefined : alt}
      />
    );
  }

  return <img src={src} alt={alt} className={className} draggable={false} />;
}
