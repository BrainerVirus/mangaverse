/**
 * Local-dev MangaDex provider bridge.
 * Copied to `local-dev/providers/mangadex/` by `pnpm dev:install-mangadex`.
 * This file is a template only — the installed copy is gitignored.
 */

const MANGADEX_API = 'https://api.mangadex.org';

async function searchManga(_ctx, input) {
  const params = new URLSearchParams({
    title: input.query.trim(),
    limit: '20',
    includes: ['cover_art'],
    'contentRating[]': ['safe', 'suggestive', 'erotica', 'pornographic'],
  });

  const response = await fetch(`${MANGADEX_API}/manga?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`MangaDex search failed (${response.status})`);
  }

  const payload = await response.json();
  const items = (payload.data ?? []).map((entry) => ({
    providerMangaId: entry.id,
    titles: Object.values(entry.attributes.title ?? {}).map((value) => ({ value, locale: 'unknown' })),
    coverUrl: resolveCover(payload, entry),
  }));

  return { items, hasMore: false };
}

function resolveCover(payload, manga) {
  const rel = manga.relationships?.find((item) => item.type === 'cover_art');
  if (!rel) return undefined;
  const file = payload.included?.find((item) => item.id === rel.id)?.attributes?.fileName;
  return file ? `https://uploads.mangadex.org/covers/${manga.id}/${file}.256.jpg` : undefined;
}

export const provider = {
  manifest: {
    id: 'mangadex',
  },
  search: searchManga,
  browseLatest: async (ctx) => searchManga(ctx, { query: '' }),
  browsePopular: async (ctx) => searchManga(ctx, { query: 'one piece' }),
};
