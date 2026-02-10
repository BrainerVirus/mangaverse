'use strict';

const baseUrl = "https://api.mangadex.org";
const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("MangaDex request failed");
    }
    return response.json();
};
const buildUrl = (path, params = []) => {
    const query = params.filter(Boolean).join("&");
    return `${baseUrl}${path}${query ? `?${query}` : ""}`;
};
const toArrayParam = (values) => values.map((value) => `includes[]=${encodeURIComponent(value)}`).join("&");
const mapCoverUrl = (mangaId, fileName) => {
    if (!fileName) {
        return undefined;
    }
    return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`;
};
const provider = {
    meta: {
        id: "mangadex",
        name: "MangaDex",
        version: "0.1.0",
        baseUrl,
        supportedLanguages: ["en"],
        supportsAuth: false,
        icon: "https://mangadex.org/favicon.ico",
    },
    async getDiscoverSections() {
        return [
            { id: "popular", title: "Most popular", items: [] },
            { id: "latest", title: "Latest updates", items: [] },
        ];
    },
    async getDiscoverSectionItems(sectionId, page) {
        const limit = 12;
        const offset = Math.max(0, page - 1) * limit;
        const baseParams = [
            "availableTranslatedLanguage[]=en",
            `limit=${limit}`,
            `offset=${offset}`,
            toArrayParam(["cover_art"]),
        ];
        const order = sectionId === "latest"
            ? "order[latestUploadedChapter]=desc"
            : "order[followedCount]=desc";
        const url = buildUrl("/manga", [order, ...baseParams]);
        const data = (await fetchJson(url));
        return data.data.map((item) => {
            const title = item.attributes.title.en ?? Object.values(item.attributes.title)[0] ?? "Untitled";
            const description = item.attributes.description?.en ?? "";
            const cover = item.relationships.find((rel) => rel.type === "cover_art")?.attributes?.fileName;
            return {
                id: item.id,
                title,
                subtitle: sectionId === "latest" ? "Latest" : "Popular",
                description,
                coverUrl: mapCoverUrl(item.id, cover),
            };
        });
    },
    async search(query, page) {
        const limit = 12;
        const offset = Math.max(0, page - 1) * limit;
        const url = buildUrl("/manga", [
            `title=${encodeURIComponent(query)}`,
            "availableTranslatedLanguage[]=en",
            `limit=${limit}`,
            `offset=${offset}`,
            toArrayParam(["cover_art"]),
        ]);
        const data = (await fetchJson(url));
        return data.data.map((item) => {
            const title = item.attributes.title.en ?? Object.values(item.attributes.title)[0] ?? "Untitled";
            const description = item.attributes.description?.en ?? "";
            const cover = item.relationships.find((rel) => rel.type === "cover_art")?.attributes?.fileName;
            return {
                id: item.id,
                title,
                subtitle: "MangaDex",
                description,
                coverUrl: mapCoverUrl(item.id, cover),
            };
        });
    },
    async getAvailableFilters() {
        return [];
    },
    async getMangaDetails(providerMangaId) {
        const url = buildUrl(`/manga/${providerMangaId}`, [toArrayParam(["cover_art", "author", "artist"])]);
        const data = (await fetchJson(url));
        const title = data.data.attributes.title.en ?? Object.values(data.data.attributes.title)[0] ?? "Untitled";
        const description = data.data.attributes.description?.en ?? "";
        const cover = data.data.relationships.find((rel) => rel.type === "cover_art")?.attributes?.fileName;
        return {
            id: data.data.id,
            title,
            subtitle: "MangaDex",
            description,
            coverUrl: mapCoverUrl(data.data.id, cover),
        };
    },
    async getChapterList(providerMangaId, languages = ["en"]) {
        const params = [
            `manga=${encodeURIComponent(providerMangaId)}`,
            "order[chapter]=asc",
            "limit=100",
            ...languages.map((lang) => `translatedLanguage[]=${encodeURIComponent(lang)}`),
        ];
        const url = buildUrl("/chapter", params);
        const data = (await fetchJson(url));
        return data.data.map((chapter) => ({
            id: chapter.id,
            title: chapter.attributes.title || `Chapter ${chapter.attributes.chapter ?? "?"}`,
            chapterNumber: chapter.attributes.chapter ? Number(chapter.attributes.chapter) : undefined,
            volumeNumber: chapter.attributes.volume ? Number(chapter.attributes.volume) : undefined,
            language: chapter.attributes.translatedLanguage,
            publishedAt: chapter.attributes.publishAt
                ? new Date(chapter.attributes.publishAt).getTime()
                : undefined,
        }));
    },
    async getChapterPages(providerChapterId) {
        const url = buildUrl(`/at-home/server/${providerChapterId}`);
        const data = (await fetchJson(url));
        return data.chapter.data.map((fileName) => ({
            url: `${data.baseUrl}/data/${data.chapter.hash}/${fileName}`,
        }));
    },
};

module.exports = provider;
