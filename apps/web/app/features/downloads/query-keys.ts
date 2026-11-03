export const downloadsQueryKeys = {
  all: ['downloads'] as const,
  forManga: (mangaId: string) => ['downloads', 'manga', mangaId] as const,
  list: () => ['downloads', 'list'] as const,
};
