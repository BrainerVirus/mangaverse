import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { MangaCard } from '@components/MangaCard';
import { SectionHeading } from '@components/SectionHeading';
import { useFavoritesStore } from '@services/library/favorites';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

export default function Library() {
	const favorites = useFavoritesStore((state) => state.items);
	const tabBarPadding = useTabBarPadding(24);
	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabBarPadding }}>
				<SectionHeading title="Library" subtitle="Your saved manga" />
				{favorites.length === 0 ? (
					<View className="border-border/30 bg-card/80 rounded-[28px] border p-6">
						<Text className="text-preset-2 font-heading text-foreground font-semibold">Your library is empty.</Text>
						<Text className="text-preset-1 font-body text-muted mt-2">Find a series in Discover or Search to add it here.</Text>
						<Link href="/discover" asChild>
							<Pressable className="bg-primary mt-4 items-center rounded-full px-4 py-2">
								<Text className="text-preset-2 font-heading text-primary-foreground text-center font-semibold">Browse Discover</Text>
							</Pressable>
						</Link>
					</View>
				) : (
					<View className="border-border/30 bg-card/70 rounded-[28px] border p-5">
						<View className="flex-row items-center justify-between">
							<View>
								<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Saved titles</Text>
								<Text className="text-preset-2 font-heading text-foreground mt-2 font-semibold">{favorites.length} series</Text>
							</View>
							<View className="border-border/40 bg-background/60 rounded-full border px-3 py-2">
								<Text className="text-preset-1 text-muted tracking-[0.2em] uppercase">Library</Text>
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
									asChild
								>
									<Pressable className="w-[47%]">
										<MangaCard title={item.title} subtitle={item.providerId} coverUrl={item.coverUrl} />
									</Pressable>
								</Link>
							))}
						</View>
					</View>
				)}
			</ScrollView>
		</View>
	);
}
