import { useEffect, useRef, useState } from 'react';
import type { MangaId, MangaIdentity, ProviderId } from '@app/shared';
import { cn } from '@app/design-system';

import { resolveCoverObjectUrl } from '../cover-cache-store.js';
import { requestCacheMaintenance } from '../cache-maintenance.js';
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
  const requestKey = `${providerId}\u0000${mangaId}\u0000${remoteUrl}`;

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

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: resolving the cover blob is an IndexedDB + network call keyed by props, with cancellation on cleanup; no event or derived value can start it
  useEffect(() => {
    if (context === null) return;

    let cancelled = false;

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
        requestCacheMaintenance({
          db: context.db,
          adapter: context.adapter,
          limitBytes: context.cacheLimitBytes,
        });
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

  if (context === null || failed || src === undefined) {
    return (
      <div
        className={cn(
          'bg-muted',
          context === null || failed ? 'animate-none' : 'animate-pulse',
          className,
        )}
        aria-hidden
      />
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />;
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
