import type { MangaIdentity } from '@app/shared';

import { resolveCoverObjectUrl } from './cover-cache-store.js';
import type { CoverCacheContextValue } from './components/CoverCacheProvider.js';
import { getDefaultProviderId } from './components/CachedCoverImage.js';

export function prefetchMangaCover(context: CoverCacheContextValue, manga: MangaIdentity): void {
  if (manga.coverImageUrl === undefined) {
    return;
  }

  void resolveCoverObjectUrl({
    db: context.db,
    adapter: context.adapter,
    providerId: getDefaultProviderId(manga),
    mangaId: manga.id,
    remoteUrl: manga.coverImageUrl,
  });
}

const hoverTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

export function scheduleMangaCoverPrefetch(
  context: CoverCacheContextValue,
  manga: MangaIdentity,
  delayMs = 250,
): void {
  const existing = hoverTimers.get(manga);
  if (existing !== undefined) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    hoverTimers.delete(manga);
    prefetchMangaCover(context, manga);
  }, delayMs);

  hoverTimers.set(manga, timer);
}

export function cancelMangaCoverPrefetch(manga: MangaIdentity): void {
  const existing = hoverTimers.get(manga);
  if (existing !== undefined) {
    clearTimeout(existing);
    hoverTimers.delete(manga);
  }
}
