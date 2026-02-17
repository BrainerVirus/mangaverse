import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { MangaCard } from '@components/MangaCard';
import { SectionHeading } from '@components/SectionHeading';
import { useFavoritesStore } from '@services/library/favorites';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

export default function Library() {
	const favorites = useFavoritesStore((state) => state.items);
	const tabBarPadding = useTabBarPadding(24);
	return (
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabBarPadding }}>
				<SectionHeading title="Library" subtitle="Your saved manga" />
				{favorites.length === 0 ? (
					<View className="rounded-[28px] border border-border/30 bg-card/80 p-6">
						<Text className="text-preset-4 font-heading font-semibold text-foreground">Your library is empty.</Text>
						<Text className="text-preset-2 font-body text-muted mt-2">Find a series in Discover or Search to add it here.</Text>
						<Link
							href="/discover"
							className="mt-4 rounded-full bg-accent px-4 py-2 text-center text-preset-2 font-heading font-semibold text-accent-foreground"
						>
							Browse Discover
						</Link>
					</View>
				) : (
					<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
						<View className="flex-row items-center justify-between">
							<View>
								<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Saved titles</Text>
								<Text className="text-preset-6 font-heading font-semibold text-foreground mt-2">{favorites.length} series</Text>
							</View>
							<View className="rounded-full border border-border/40 bg-background/60 px-3 py-2">
								<Text className="text-preset-1 tracking-[0.2em] text-muted uppercase">Library</Text>
							</View>
						</View>
						<View className="mt-4 flex-row flex-wrap gap-4">
							{favorites.map((item) => (
								<Link
									key={`${item.providerId}-${item.id}`}
									href={{
										pathname: '/manga/[id]',
										params: { id: item.id, provider: item.providerId },
									}}
									className="w-[47%]"
								>
									<MangaCard title={item.title} subtitle={item.providerId} coverUrl={item.coverUrl} />
								</Link>
							))}
						</View>
					</View>
				)}
			</ScrollView>
		</View>
	);
}
