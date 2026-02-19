import { Animated, Pressable, Text, View } from 'react-native';

interface ErrorDrawerProps {
	providerLoadError: string;
	height: Animated.Value;
	onToggleHeight: () => void;
	onClose: () => void;
}

export function ErrorDrawer({ providerLoadError, height, onToggleHeight, onClose }: ErrorDrawerProps) {
	return (
		<View className="absolute inset-0" pointerEvents="box-none">
			<View className="flex-1" pointerEvents="box-none" />
			<Animated.View style={{ height }} className="border-border bg-card rounded-t-box overflow-hidden border shadow-2xl">
				<View className="items-center justify-center">
					<Pressable onPress={onToggleHeight} className="h-7 w-full items-center justify-center">
						<View className="bg-border rounded-badge h-1.5 w-12" />
					</Pressable>
				</View>
				<View className="px-5 pt-2 pb-6">
					<View className="flex-row items-center justify-between">
						<Text className="text-foreground text-preset-2 font-heading font-semibold">Provider error</Text>
						<Pressable onPress={onClose} className="border-border bg-background rounded-badge h-8 w-8 items-center justify-center border">
							<Text className="text-muted text-preset-1 font-body">×</Text>
						</Pressable>
					</View>
					<Text className="text-muted text-preset-1 font-body mt-2">The selected provider failed to load. Update the extension bundle.</Text>
					<View className="border-warning/40 bg-warning/10 rounded-control mt-4 border px-4 py-3">
						<Text className="text-warning text-preset-1 font-body">{providerLoadError}</Text>
					</View>
				</View>
			</Animated.View>
		</View>
	);
}
