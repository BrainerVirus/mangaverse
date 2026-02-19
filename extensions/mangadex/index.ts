const baseUrl = 'https://api.mangadex.org';
const siteUrl = 'https://mangadex.org';

const fetchJson = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error('MangaDex request failed');
	}
	return response.json();
};

const buildUrl = (path: string, params: string[] = []) => {
	const query = params.filter(Boolean).join('&');
	return `${baseUrl}${path}${query ? `?${query}` : ''}`;
};

const toArrayParam = (values: string[]) => values.map((value) => `includes[]=${encodeURIComponent(value)}`).join('&');

const mapCoverUrl = (mangaId: string, fileName?: string | null) => {
	if (!fileName) {
		return undefined;
	}
	return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`;
};

const provider = {
	meta: {
		id: 'mangadex',
		name: 'MangaDex',
		version: '0.1.0',
		baseUrl: siteUrl,
		supportedLanguages: ['en'],
		supportsAuth: false,
		icon: 'https://mangadex.org/favicon.ico',
	},
	async getDiscoverSections() {
		return [
			{ id: 'popular', title: 'Popular', items: [] },
			{ id: 'latest', title: 'Latest Updates', items: [] },
			{ id: 'recent', title: 'Recently Added', items: [] },
		];
	},
	async getDiscoverGenres() {
		const url = buildUrl('/manga/tag', ['limit=100']);
		const data = (await fetchJson(url)) as {
			data: { id: string; attributes: { name: Record<string, string> } }[];
		};
		return data.data.map((tag) => {
			const name = tag.attributes.name.en ?? Object.values(tag.attributes.name)[0] ?? 'Genre';
			return {
				id: tag.id,
				title: name,
				subtitle: 'Genre',
			};
		});
	},
	async getDiscoverSectionItems(sectionId: string, page: number, filters?: Record<string, unknown>) {
		const limit = 12;
		const offset = Math.max(0, page - 1) * limit;
		const baseParams = ['availableTranslatedLanguage[]=en', `limit=${limit}`, `offset=${offset}`, toArrayParam(['cover_art'])];
		const genreId = typeof filters?.genreId === 'string' ? filters.genreId : undefined;
		if (sectionId === 'genres' && genreId) {
			baseParams.unshift(`includedTags[]=${encodeURIComponent(genreId)}`);
		}
		const order =
			sectionId === 'latest' ? 'order[latestUploadedChapter]=desc' : sectionId === 'recent' ? 'order[createdAt]=desc' : 'order[followedCount]=desc';
		const url = buildUrl('/manga', [order, ...baseParams]);
		const data = (await fetchJson(url)) as {
			data: {
				id: string;
				attributes: {
					title: Record<string, string>;
					description?: Record<string, string>;
					lastChapter?: string | null;
					tags?: { attributes?: { name?: Record<string, string> } }[];
				};
				relationships: { type: string; attributes?: { fileName?: string } }[];
			}[];
		};
		return data.data.map((item) => {
			const title = item.attributes.title.en ?? Object.values(item.attributes.title)[0] ?? 'Untitled';
			const description = item.attributes.description?.en ?? '';
			const cover = item.relationships.find((rel) => rel.type === 'cover_art')?.attributes?.fileName;
			const lastChapter = item.attributes.lastChapter?.trim();
			const chapterLabel = lastChapter ? `Chapter ${lastChapter}` : undefined;
			const tags = item.attributes.tags
				?.map((tag: { attributes?: { name?: Record<string, string> } }) => tag.attributes?.name?.en ?? Object.values(tag.attributes?.name ?? {})[0])
				.filter((tag): tag is string => Boolean(tag));
			const subtitle = sectionId === 'latest' ? 'Latest' : sectionId === 'recent' ? 'Recent' : 'Popular';
			return {
				id: item.id,
				title,
				subtitle: chapterLabel ?? subtitle,
				description,
				coverUrl: mapCoverUrl(item.id, cover),
				tags,
				lastChapter,
				language: 'en',
			};
		});
	},
	async search(query: string, page: number) {
		const limit = 12;
		const offset = Math.max(0, page - 1) * limit;
		const url = buildUrl('/manga', [
			`title=${encodeURIComponent(query)}`,
			'availableTranslatedLanguage[]=en',
			`limit=${limit}`,
			`offset=${offset}`,
			toArrayParam(['cover_art']),
		]);
		const data = (await fetchJson(url)) as {
			data: {
				id: string;
				attributes: { title: Record<string, string>; description?: Record<string, string> };
				relationships: { type: string; attributes?: { fileName?: string } }[];
			}[];
		};
		return data.data.map((item) => {
			const title = item.attributes.title.en ?? Object.values(item.attributes.title)[0] ?? 'Untitled';
			const description = item.attributes.description?.en ?? '';
			const cover = item.relationships.find((rel) => rel.type === 'cover_art')?.attributes?.fileName;
			return {
				id: item.id,
				title,
				subtitle: 'MangaDex',
				description,
				coverUrl: mapCoverUrl(item.id, cover),
			};
		});
	},
	async getAvailableFilters() {
		return [];
	},
	async getMangaDetails(providerMangaId: string) {
		const url = buildUrl(`/manga/${providerMangaId}`, [toArrayParam(['cover_art', 'author', 'artist'])]);
		const data = (await fetchJson(url)) as {
			data: {
				id: string;
				attributes: { title: Record<string, string>; description?: Record<string, string> };
				relationships: { type: string; attributes?: { fileName?: string; name?: string } }[];
			};
		};
		const title = data.data.attributes.title.en ?? Object.values(data.data.attributes.title)[0] ?? 'Untitled';
		const description = data.data.attributes.description?.en ?? '';
		const cover = data.data.relationships.find((rel) => rel.type === 'cover_art')?.attributes?.fileName;
		return {
			id: data.data.id,
			title,
			subtitle: 'MangaDex',
			description,
			coverUrl: mapCoverUrl(data.data.id, cover),
		};
	},
	async getChapterList(providerMangaId: string, languages: string[] = ['en']) {
		const params = [
			`manga=${encodeURIComponent(providerMangaId)}`,
			'order[chapter]=asc',
			'limit=100',
			...languages.map((lang) => `translatedLanguage[]=${encodeURIComponent(lang)}`),
		];
		const url = buildUrl('/chapter', params);
		const data = (await fetchJson(url)) as {
			data: {
				id: string;
				attributes: {
					title?: string | null;
					chapter?: string | null;
					volume?: string | null;
					translatedLanguage?: string;
					publishAt?: string;
				};
			}[];
		};
		return data.data.map((chapter) => ({
			id: chapter.id,
			title: chapter.attributes.title || `Chapter ${chapter.attributes.chapter ?? '?'}`,
			chapterNumber: chapter.attributes.chapter ? Number(chapter.attributes.chapter) : undefined,
			volumeNumber: chapter.attributes.volume ? Number(chapter.attributes.volume) : undefined,
			language: chapter.attributes.translatedLanguage,
			publishedAt: chapter.attributes.publishAt ? new Date(chapter.attributes.publishAt).getTime() : undefined,
		}));
	},
	async getChapterPages(providerChapterId: string) {
		const url = buildUrl(`/at-home/server/${providerChapterId}`);
		const data = (await fetchJson(url)) as {
			baseUrl: string;
			chapter: { hash: string; data: string[] };
		};
		return data.chapter.data.map((fileName) => ({
			url: `${data.baseUrl}/data/${data.chapter.hash}/${fileName}`,
		}));
	},
};

export default provider;
