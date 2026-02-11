import { render, waitFor } from "@testing-library/react-native"

import Discover from "@app/(tabs)/discover"
import DiscoverSection from "@app/discover/[sectionId]"

const mockExtensions = {
	enabledProviders: [
		{
			id: "mangadex",
			name: "MangaDex",
			meta: {
				id: "mangadex",
				name: "MangaDex",
				version: "0.1.0",
				baseUrl: "",
				supportedLanguages: ["en"],
				supportsAuth: false,
			},
			sections: [
				{
					id: "popular",
					title: "Popular",
					items: [
						{
							id: "hero-1",
							title: "Hero Title",
							subtitle: "Popular",
							description: "Hero description",
							coverUrl: "https://example.com/hero.jpg",
						},
					],
				},
			],
		},
	],
	selectedProviderId: "mangadex",
	providers: {
		mangadex: {
			meta: {
				id: "mangadex",
				name: "MangaDex",
				version: "0.1.0",
				baseUrl: "",
				supportedLanguages: ["en"],
				supportsAuth: false,
			},
			getDiscoverGenres: jest.fn(async () => [
				{ id: "genre-1", title: "Action" },
				{ id: "genre-2", title: "Romance" },
			]),
			getDiscoverSections: jest.fn(async () => [
				{ id: "genres", title: "Genres", items: [] },
				{ id: "popular", title: "Popular", items: [] },
			]),
			getDiscoverSectionItems: jest.fn(async () => [
				{ id: "item-1", title: "Item 1", subtitle: "Popular", coverUrl: "" },
				{ id: "item-2", title: "Item 2", subtitle: "Popular", coverUrl: "" },
			]),
			search: jest.fn(async () => []),
			getAvailableFilters: jest.fn(async () => []),
			getMangaDetails: jest.fn(async () => ({
				id: "item-1",
				title: "Item 1",
			})),
			getChapterList: jest.fn(async () => []),
			getChapterPages: jest.fn(async () => []),
		},
	},
	refreshProviders: jest.fn(async () => {}),
	setSelectedProvider: jest.fn(),
}

jest.mock("expo-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => children,
	useLocalSearchParams: () => ({ sectionId: "popular", provider: "mangadex", title: "Popular" }),
}))

jest.mock("@stores/extensions", () => ({
	useExtensionsStore: (selector: (state: typeof mockExtensions) => unknown) => selector(mockExtensions),
}))

jest.mock("@services/library/favorites", () => ({
	useFavoritesStore: () => ({
		contains: () => false,
		add: jest.fn(),
		remove: jest.fn(),
	}),
}))

describe("Discover screens", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	test("Discover renders hero and sections", async () => {
		const { getByText } = render(<Discover />)

		expect(getByText("Discover")).toBeTruthy()
		expect(getByText("Hero Title")).toBeTruthy()
		expect(getByText("Popular")).toBeTruthy()

		await waitFor(() => {
			expect(mockExtensions.providers.mangadex.getDiscoverSections).toHaveBeenCalled()
			expect(mockExtensions.providers.mangadex.getDiscoverSectionItems).toHaveBeenCalled()
		})
	})

	test("Discover section loads grid items", async () => {
		const { getByText } = render(<DiscoverSection />)

		await waitFor(() => {
			expect(getByText("Item 1")).toBeTruthy()
			expect(getByText("Item 2")).toBeTruthy()
		})
	})
})
