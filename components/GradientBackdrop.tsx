import { View } from "react-native"

export function GradientBackdrop() {
	return (
		<View className="absolute inset-0">
			<View className="absolute -left-20 -top-32 h-96 w-96 rounded-full bg-amber-500/15 blur-[120px]" />
			<View className="absolute right-0 top-40 h-80 w-80 rounded-full bg-orange-500/15 blur-[130px]" />
			<View className="absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-rose-500/10 blur-[140px]" />
			<View className="absolute inset-0 bg-[#0b0b0c]/95" />
		</View>
	)
}
