import { useEffect, useRef } from "react"
import { Animated, Pressable, ScrollView, Text, View } from "react-native"

interface DiscoverHeaderProps {
	providers: Array<{ id: string; name: string }>
	selectedProviderId?: string
	onSelectProvider: (id: string) => void
	onOpenProvider: () => void
	indicatorX: Animated.Value
	indicatorWidth: Animated.Value
	gap: number
	onTabLayout: (id: string, layout: { x: number; width: number }) => void
	loading?: boolean
}

export function DiscoverHeader({
	providers,
	selectedProviderId,
	onSelectProvider,
	onOpenProvider,
	indicatorX,
	indicatorWidth,
	gap,
	onTabLayout,
	loading = false,
}: DiscoverHeaderProps) {
	const hasProviders = providers.length > 0
	const pulse = useRef(new Animated.Value(0.35)).current

	useEffect(() => {
		if (!loading) {
			pulse.setValue(1)
			return
		}
		const animation = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, {
					toValue: 0.85,
					duration: 900,
					useNativeDriver: true,
				}),
				Animated.timing(pulse, {
					toValue: 0.35,
					duration: 900,
					useNativeDriver: true,
				}),
			])
		)
		animation.start()
		return () => animation.stop()
	}, [loading, pulse])
	return (
		<View>
			<View className="relative items-center justify-center">
				<Text className="text-foreground text-base font-semibold">Discover</Text>
				<Pressable
					onPress={onOpenProvider}
					className="border-border bg-card absolute right-0 h-9 w-9 items-center justify-center rounded-full border"
				>
					<Text className="text-accent text-base">☁</Text>
				</Pressable>
			</View>
			<View className="mt-4">
				<View className="relative -mx-2 px-2">
					<View className="bg-border absolute right-0 bottom-0 left-0 h-[2px]" />
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						className="pb-3"
						contentContainerStyle={{ columnGap: gap }}
					>
						<View className="relative flex-row" style={{ columnGap: gap }}>
							{loading ? (
								<>
									{[0, 1, 2, 3].map((index) => (
										<Animated.View
											key={`tab-skeleton-${index}`}
											style={{ opacity: pulse }}
											className="bg-card h-7 w-24 rounded-full"
										/>
									))}
								</>
							) : (
								<>
									<Animated.View
										style={{
											transform: [{ translateX: indicatorX }],
											width: indicatorWidth,
										}}
										className="bg-accent absolute bottom-0 h-[4px] rounded-full"
									/>
									{hasProviders ? (
										providers.map((provider) => {
											const active = provider.id === selectedProviderId
											return (
												<Pressable
													key={provider.id}
													onPress={() => onSelectProvider(provider.id)}
													onLayout={(event) => {
														const { x, width } = event.nativeEvent.layout
														onTabLayout(provider.id, { x, width })
													}}
													className="px-4 pb-3"
												>
													<Text
														className={`text-sm font-semibold ${
															active ? "text-accent" : "text-muted"
														}`}
													>
														{provider.name}
													</Text>
												</Pressable>
											)
										})
									) : (
										<View className="border-border rounded-full border px-4 py-2">
											<Text className="text-muted text-xs tracking-[0.2em] uppercase">
												No providers
											</Text>
										</View>
									)}
								</>
							)}
						</View>
					</ScrollView>
				</View>
			</View>
		</View>
	)
}
