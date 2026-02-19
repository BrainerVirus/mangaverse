import { Image, ImageSourcePropType, View } from 'react-native';

const coverArt = require('@assets/icon.png');

export function BrandCover() {
	return (
		<View className="border-border/40 bg-card relative h-48 w-36 overflow-hidden rounded-[28px] border">
			<Image source={coverArt as ImageSourcePropType} className="h-full w-full" />
		</View>
	);
}
