import { Animated, Pressable, Text, View } from "react-native"

interface ErrorDrawerProps {
	providerLoadError: string
	height: Animated.Value
	onToggleHeight: () => void
	onClose: () => void
}

export function ErrorDrawer({
	providerLoadError,
	height,
	onToggleHeight,
	onClose,
}: ErrorDrawerProps) {
	return (
		<View className="absolute inset-0" pointerEvents="box-none">
			<View className="flex-1" pointerEvents="box-none" />
			<Animated.View
				style={{ height }}
				className="border-border bg-card overflow-hidden rounded-t-[28px] border shadow-2xl"
			>
				<View className="items-center justify-center">
					<Pressable onPress={onToggleHeight} className="h-7 w-full items-center justify-center">
						<View className="bg-border h-1.5 w-12 rounded-full" />
					</Pressable>
				</View>
				<View className="px-5 pt-2 pb-6">
					<View className="flex-row items-center justify-between">
						<Text className="text-foreground text-base font-semibold">Provider error</Text>
						<Pressable
							onPress={onClose}
							className="border-border bg-background h-8 w-8 items-center justify-center rounded-full border"
						>
							<Text className="text-muted text-sm">×</Text>
						</Pressable>
					</View>
					<Text className="text-muted mt-2 text-sm">
						The selected provider failed to load. Update the extension bundle.
					</Text>
					<View className="mt-4 rounded-[18px] border border-amber-500/40 bg-amber-500/10 px-4 py-3">
						<Text className="text-sm text-amber-100">{providerLoadError}</Text>
					</View>
				</View>
			</Animated.View>
		</View>
	)
}
