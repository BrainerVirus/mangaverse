import { Pressable, ScrollView, Text, View } from 'react-native';

interface DiscoverHeaderProps {
	providers: { id: string; name: string }[];
	selectedProviderId?: string;
	onSelectProvider: (id: string) => void;
	onOpenProvider: () => void;
	gap: number;
	onTabLayout: (id: string, layout: { x: number; width: number }) => void;
}

export function DiscoverHeader({ providers, selectedProviderId, onSelectProvider, onOpenProvider, gap, onTabLayout }: DiscoverHeaderProps) {
	const hasProviders = providers.length > 0;
	return (
		<View>
			<View className="relative items-center justify-center">
				<Text className="text-foreground text-preset-2 font-heading font-semibold">Discover</Text>
				<Pressable
					onPress={onOpenProvider}
					className="border-border bg-card rounded-badge absolute right-0 h-9 w-9 items-center justify-center border"
				>
					<Text className="text-primary text-preset-2 font-body">☁</Text>
				</Pressable>
			</View>
			<View className="mt-4">
				<View className="relative -mx-2 px-2">
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ columnGap: gap }}>
						<View className="relative flex-row pb-1" style={{ columnGap: gap }}>
							{hasProviders ? (
								<>
									{providers.map((provider) => {
										const active = provider.id === selectedProviderId;
										return (
											<Pressable
												key={provider.id}
												onPress={() => onSelectProvider(provider.id)}
												onLayout={(event) => {
													const { x, width } = event.nativeEvent.layout;
													onTabLayout(provider.id, { x, width });
												}}
												className="px-4 pb-1"
											>
												<Text className={`text-preset-1 font-heading font-semibold ${active ? 'text-primary' : 'text-muted'}`}>{provider.name}</Text>
											</Pressable>
										);
									})}
								</>
							) : (
								<View className="border-border rounded-badge border px-4 py-2">
									<Text className="text-muted text-preset-1 tracking-[0.2em] uppercase">No providers</Text>
								</View>
							)}
						</View>
					</ScrollView>
				</View>
			</View>
		</View>
	);
}
