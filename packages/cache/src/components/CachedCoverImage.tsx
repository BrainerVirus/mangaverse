import { useEffect, useRef, useState } from 'react';
import type { MangaId, MangaIdentity, ProviderId } from '@app/shared';
import { cn } from '@app/design-system';

import { resolveCoverObjectUrl } from '../cover-cache-store.js';
import { useCoverCacheContext } from './CoverCacheProvider.js';

export interface CachedCoverImageProps {
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly remoteUrl: string;
  readonly alt: string;
  readonly className?: string;
}

export function CachedCoverImage({
  providerId,
  mangaId,
  remoteUrl,
  alt,
  className,
}: CachedCoverImageProps) {
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
      const result = await resolveCoverObjectUrl({
        db: context.db,
        adapter: context.adapter,
        providerId,
        mangaId,
        remoteUrl,
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

      if (!result.fromCache) {
        void runMaintenance(context);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current !== undefined) {
        void context.adapter.blobStorage.revokeObjectUrl(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
    };
  }, [context, mangaId, providerId, remoteUrl]);

  if (failed || src === undefined) {
    return (
      <div
        className={cn('bg-muted', failed ? 'animate-none' : 'animate-pulse', className)}
        aria-hidden
      />
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />;
}

async function runMaintenance(context: NonNullable<ReturnType<typeof useCoverCacheContext>>) {
  const { runCoverCacheMaintenance } = await import('../cover-cache-store.js');
  await runCoverCacheMaintenance(context.db, context.adapter, context.cacheLimitBytes);
}

export function getDefaultProviderId(manga: MangaIdentity): string {
  const defaultMapping = manga.providerMappings.find(
    (mapping) => mapping.id === manga.defaultProviderMappingId,
  );
  return String(defaultMapping?.providerId ?? manga.providerMappings[0]?.providerId ?? 'unknown');
}

export interface CachedMangaCardCoverProps {
  readonly manga: MangaIdentity;
  readonly className?: string;
}

export function CachedMangaCardCover({ manga, className }: CachedMangaCardCoverProps) {
  if (manga.coverImageUrl === undefined) {
    return <div className={cn('bg-muted', className)} aria-hidden />;
  }

  return (
    <CachedCoverImage
      providerId={getDefaultProviderId(manga)}
      mangaId={manga.id}
      remoteUrl={manga.coverImageUrl}
      alt={manga.canonicalTitle}
      {...(className !== undefined ? { className } : {})}
    />
  );
}
