import { Image, ImageSourcePropType, View } from "react-native"

const coverArt = require("@assets/icon.png")

export function BrandCover() {
	return (
		<View className="relative h-48 w-36 overflow-hidden rounded-[28px] border border-white/10 bg-neutral-900">
			<Image source={coverArt as ImageSourcePropType} className="h-full w-full" />
		</View>
	)
}
