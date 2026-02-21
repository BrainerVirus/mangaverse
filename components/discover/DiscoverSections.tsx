import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { HorizontalSection } from '@components/HorizontalSection';
import { MangaCard } from '@components/MangaCard';
import { GenreSection } from '@components/discover/GenreSection';

import type { ProviderDiscoverSection, ProviderMangaItem } from '../../types/provider';

interface DiscoverSectionsProps {
	sections: ProviderDiscoverSection[];
	sectionItems: Record<string, ProviderMangaItem[]>;
	providerId?: string;
	pagePadding: number;
	gap: number;
	cardWidth: number;
	peek: number;
	sectionLoading: Record<string, boolean>;
	onLoadMore: (sectionId: string) => void;
	isInLibrary: (itemId: string) => boolean;
}

export function DiscoverSections({
	sections,
	sectionItems,
	providerId,
	pagePadding,
	gap,
	cardWidth,
	peek,
	sectionLoading,
	onLoadMore,
	isInLibrary,
}: DiscoverSectionsProps) {
	const router = useRouter();
	const [focusedKey, setFocusedKey] = useState<string | null>(null);

	const handleHorizontalScroll =
		(sectionId: string) =>
		(event: {
			nativeEvent: {
				layoutMeasurement: { width: number };
				contentOffset: { x: number };
				contentSize: { width: number };
			};
		}) => {
			const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
			const threshold = 120;
			if (layoutMeasurement.width + contentOffset.x >= contentSize.width - threshold) {
				onLoadMore(sectionId);
			}
		};

	const handleMangaPressIn = useCallback(
		(sectionId: string, item: ProviderMangaItem) => {
			const key = `${sectionId}-${item.id}`;
			if (focusedKey !== key) {
				setFocusedKey(key);
			}
		},
		[focusedKey],
	);

	const handleMangaPress = useCallback(
		(item: ProviderMangaItem) => {
			setFocusedKey(null);
			router.push({
				pathname: '/manga/[id]',
				params: { id: item.id, provider: providerId },
			});
		},
		[providerId, router],
	);

	return (
		<View className="mt-6 gap-6">
			{sections.map((section) => {
				const items = sectionItems[section.id] ?? [];
				if (section.id === 'genres') {
					return (
						<GenreSection
							key={section.id}
							items={items}
							providerId={providerId}
							pagePadding={pagePadding}
							gap={gap}
							cardWidth={cardWidth}
							peek={peek}
							isLoading={sectionLoading[section.id]}
							sectionTitle={section.title || 'Genres'}
							focusedKey={focusedKey}
							onFocus={setFocusedKey}
							onScroll={handleHorizontalScroll(section.id)}
						/>
					);
				}
				return (
					<HorizontalSection
						key={section.id}
						sectionId={section.id}
						title={section.title}
						items={items}
						providerId={providerId}
						pagePadding={pagePadding}
						gap={gap}
						cardWidth={cardWidth}
						peek={peek}
						isLoading={sectionLoading[section.id]}
						onScroll={handleHorizontalScroll(section.id)}
						renderItem={(item) => (
							<Pressable onPressIn={() => handleMangaPressIn(section.id, item)} onPress={() => handleMangaPress(item)}>
								<MangaCard
									title={item.title}
									subtitle={item.subtitle}
									coverUrl={item.coverUrl}
									tags={item.tags}
									lastChapter={item.lastChapter}
									language={item.language}
									inLibrary={isInLibrary(item.id)}
									focused={focusedKey === `${section.id}-${item.id}`}
								/>
							</Pressable>
						)}
					/>
				);
			})}
		</View>
	);
}
