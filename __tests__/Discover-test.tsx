import { render, waitFor } from '@testing-library/react-native';

import Discover from '@app/(tabs)/discover';
import DiscoverSection from '@app/discover/[sectionId]';

const mockExtensions = {
	enabledProviders: [
		{
			id: 'mangadex',
			name: 'MangaDex',
			meta: {
				id: 'mangadex',
				name: 'MangaDex',
				version: '0.1.0',
				baseUrl: '',
				supportedLanguages: ['en'],
				supportsAuth: false,
			},
			sections: [
				{
					id: 'popular',
					title: 'Popular',
					items: [
						{
							id: 'hero-1',
							title: 'Hero Title',
							subtitle: 'Popular',
							description: 'Hero description',
							coverUrl: 'https://example.com/hero.jpg',
						},
					],
				},
			],
		},
	],
	selectedProviderId: 'mangadex',
	providers: {
		mangadex: {
			meta: {
				id: 'mangadex',
				name: 'MangaDex',
				version: '0.1.0',
				baseUrl: '',
				supportedLanguages: ['en'],
				supportsAuth: false,
			},
			getDiscoverGenres: jest.fn(async () => [
				{ id: 'genre-1', title: 'Action' },
				{ id: 'genre-2', title: 'Romance' },
			]),
			getDiscoverSections: jest.fn(async () => [
				{ id: 'genres', title: 'Genres', items: [] },
				{ id: 'popular', title: 'Popular', items: [] },
			]),
			getDiscoverSectionItems: jest.fn(async (sectionId: string, page: number, filters?: Record<string, unknown>) => {
				if (sectionId === 'genres' && filters?.genreId) {
					return [
						{ id: 'genre-item-1', title: 'Genre Item 1', subtitle: 'Chapter 1' },
						{ id: 'genre-item-2', title: 'Genre Item 2', subtitle: 'Chapter 2' },
					];
				}
				return [
					{ id: 'item-1', title: 'Item 1', subtitle: 'Popular', coverUrl: '' },
					{ id: 'item-2', title: 'Item 2', subtitle: 'Popular', coverUrl: '' },
				];
			}),
			search: jest.fn(async () => []),
			getAvailableFilters: jest.fn(async () => []),
			getMangaDetails: jest.fn(async () => ({
				id: 'item-1',
				title: 'Item 1',
			})),
			getChapterList: jest.fn(async () => []),
			getChapterPages: jest.fn(async () => []),
		},
	},
	refreshProviders: jest.fn(async () => {}),
	setSelectedProvider: jest.fn(),
	loadErrors: {},
};

jest.mock('expo-router', () => {
	const React = require('react');
	const MockLink = React.forwardRef(function MockLink({ children, asChild, ...rest }: any, ref: any) {
		if (asChild && React.isValidElement(children)) {
			return React.cloneElement(children, { ref });
		}
		return React.createElement('Text', rest, children);
	});
	MockLink.displayName = 'MockLink';
	return {
		Link: MockLink,
		useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
		useLocalSearchParams: jest.fn(() => ({
			sectionId: 'popular',
			provider: 'mangadex',
			title: 'Popular',
		})),
	};
});

afterEach(() => {
	const { useLocalSearchParams } = jest.requireMock('expo-router');
	useLocalSearchParams.mockReturnValue({
		sectionId: 'popular',
		provider: 'mangadex',
		title: 'Popular',
	});
});

jest.mock('@stores/extensions', () => ({
	useExtensionsStore: (selector: (state: typeof mockExtensions) => unknown) => selector(mockExtensions),
}));

jest.mock('@stores/settings', () => ({
	useSettingsStore: (
		selector: (state: {
			showProviderErrors: boolean;
			theme: string;
			genrePaletteByTheme: Record<string, string[]>;
			setGenrePalette: () => void;
		}) => unknown,
	) =>
		selector({
			showProviderErrors: true,
			theme: 'Modern',
			genrePaletteByTheme: {},
			setGenrePalette: jest.fn(),
		}),
}));

jest.mock('expo-blur', () => {
	const React = require('react');
	const { View } = require('react-native');
	return { BlurView: (props: any) => React.createElement(View, props) };
});

jest.mock('expo-linear-gradient', () => {
	const React = require('react');
	const { View } = require('react-native');
	return { LinearGradient: (props: any) => React.createElement(View, props) };
});

jest.mock('expo-web-browser', () => ({
	openBrowserAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
	const actual = jest.requireActual('react-native-safe-area-context');
	return {
		...actual,
		SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
		useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
	};
});

jest.mock('@services/library/favorites', () => ({
	useFavoritesStore: () => ({
		contains: () => false,
		add: jest.fn(),
		remove: jest.fn(),
	}),
}));

describe('Discover screens', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('Discover renders hero and sections', async () => {
		const { getByText, getAllByText } = render(<Discover />);

		expect(getByText('Discover')).toBeTruthy();

		await waitFor(() => {
			expect(getAllByText('Popular').length).toBeGreaterThan(0);
			expect(mockExtensions.providers.mangadex.getDiscoverSections).toHaveBeenCalled();
			expect(mockExtensions.providers.mangadex.getDiscoverSectionItems).toHaveBeenCalled();
		});
		expect(getAllByText('Item 1').length).toBeGreaterThan(0);
	});

	test('Discover section loads grid items', async () => {
		const { useLocalSearchParams } = jest.requireMock('expo-router');
		useLocalSearchParams.mockReturnValue({
			sectionId: 'popular',
			provider: 'mangadex',
			title: 'Popular',
		});
		const { getByText } = render(<DiscoverSection />);

		await waitFor(() => {
			expect(getByText('Item 1')).toBeTruthy();
			expect(getByText('Item 2')).toBeTruthy();
		});
	});

	test('Discover section loads genre results', async () => {
		const { useLocalSearchParams } = jest.requireMock('expo-router');
		useLocalSearchParams.mockReturnValue({
			sectionId: 'genre-1',
			provider: 'mangadex',
			title: 'Action',
		});
		const { getByText } = render(<DiscoverSection />);

		await waitFor(() => {
			expect(getByText('Genre Item 1')).toBeTruthy();
			expect(getByText('Genre Item 2')).toBeTruthy();
		});
	});
});
