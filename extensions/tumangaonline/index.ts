const baseUrl = "https://zonatmo.com"

const fetchText = async (url: string) => {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error("TuMangaOnline request failed")
	}
	return response.text()
}

const decodeHtml = (value: string) =>
	value
		.replace(/&quot;/g, "\"")
		.replace(/&#039;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, " ").trim())

const mapLibraryItems = (html: string) => {
	const items: Array<{ id: string; title: string; coverUrl?: string }> = []
	const cardRegex = /<a[^>]+href="([^"]+\/library\/[^\"]+)"[^>]*>([\s\S]*?)<\/a>/g
	let match: RegExpExecArray | null
	while ((match = cardRegex.exec(html))) {
		const href = match[1]
		const block = match[2]
		const idMatch = href.match(/\/library\/[^/]+\/(\d+)/)
		if (!idMatch) {
			continue
		}
		const titleMatch = block.match(/title="([^"]+)"/)
		const altMatch = block.match(/alt="([^"]+)"/)
		const imgMatch = block.match(/<img[^>]+src="([^"]+)"/)
		const title = decodeHtml(titleMatch?.[1] || altMatch?.[1] || "Unknown")
		const coverUrl = imgMatch?.[1]
		items.push({ id: idMatch[1], title, coverUrl })
	}
	return items
}

const mapMangaDetails = (html: string, providerMangaId: string) => {
	const titleMatch = html.match(/<h1[^>]*class="[^"]*manga-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
	const altTitleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
	const descriptionMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/)
	const coverMatch = html.match(/<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/)
	const title = stripTags(titleMatch?.[1] || altTitleMatch?.[1] || "Unknown")
	const description = descriptionMatch ? stripTags(descriptionMatch[1]) : ""
	const coverUrl = coverMatch?.[1]
	return {
		id: providerMangaId,
		title,
		subtitle: "TuMangaOnline",
		description,
		coverUrl,
	}
}

const mapChapterList = (html: string) => {
	const chapters: Array<{ id: string; title: string; chapterNumber?: number }> = []
	const chapterRegex = /href="([^"]+\/view_uploads\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g
	let match: RegExpExecArray | null
	while ((match = chapterRegex.exec(html))) {
		const id = match[2]
		const label = stripTags(match[3])
		const numberMatch = label.match(/(?:Cap\.?|Chapter)\s*([0-9]+(?:\.[0-9]+)?)/i)
		chapters.push({
			id,
			title: label || `Chapter ${id}`,
			chapterNumber: numberMatch ? Number(numberMatch[1]) : undefined,
		})
	}
	return chapters
}

const provider = {
	meta: {
		id: "tumangaonline",
		name: "TuMangaOnline",
		version: "0.1.0",
		baseUrl,
		supportedLanguages: ["es"],
		supportsAuth: false,
		icon: "https://zonatmo.com/favicon/favicon-32x32.png",
	},
	async getDiscoverSections() {
		return [
			{ id: "trending", title: "Tendencias", items: [] },
			{ id: "recent", title: "Recientes", items: [] },
		]
	},
	async getDiscoverSectionItems(sectionId: string, page: number) {
		const pageParam = page > 1 ? `?page=${page}` : ""
		const path = sectionId === "recent" ? "/library" : "/library"
		const html = await fetchText(`${baseUrl}${path}${pageParam}`)
		const items = mapLibraryItems(html)
		return items.map((item) => ({
			id: item.id,
			title: item.title,
			subtitle: "TuMangaOnline",
			description: "",
			coverUrl: item.coverUrl,
		}))
	},
	async search(query: string, page: number) {
		const pageParam = page > 1 ? `&page=${page}` : ""
		const html = await fetchText(
			`${baseUrl}/library?title=${encodeURIComponent(query)}${pageParam}`
		)
		const items = mapLibraryItems(html)
		return items.map((item) => ({
			id: item.id,
			title: item.title,
			subtitle: "TuMangaOnline",
			description: "",
			coverUrl: item.coverUrl,
		}))
	},
	async getAvailableFilters() {
		return []
	},
	async getMangaDetails(providerMangaId: string) {
		const html = await fetchText(`${baseUrl}/library/manga/${providerMangaId}`)
		return mapMangaDetails(html, providerMangaId)
	},
	async getChapterList(providerMangaId: string) {
		const html = await fetchText(`${baseUrl}/library/manga/${providerMangaId}`)
		return mapChapterList(html)
	},
	async getChapterPages() {
		return []
	},
}

export default provider
