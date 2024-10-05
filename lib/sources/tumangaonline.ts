export const tumangaonline = {
	getAllPopularManga: "http://172.28.199.100:3000/tumangaonline/api/v1/mangas/popular",
	// getAllLatestManga: "https://visortmo.com/api/v1/mangas/latest",
	// getAllManga: "https://visortmo.com/api/v1/mangas",
	// getManga: "https://visortmo.com/api/v1/manga",
	// getChapter: "https://visortmo.com/api/v1/chapter",
	// getSearch: "https://visortmo.com//api/v1/search",
}

export type PopularManga = {
	title: string
	url: string
	cover: string
}

export const fetchPopularManga = async () => {
	try {
		const response = await fetch(tumangaonline.getAllPopularManga)
		const data = await response.json()
		return data as PopularManga[]
	} catch (error) {
		console.error(error)
	}
}
