import { View } from "react-native"

export function GradientBackdrop() {
	return (
		<View className="absolute inset-0">
			<View className="absolute inset-0 bg-background" />
		</View>
	)
}
