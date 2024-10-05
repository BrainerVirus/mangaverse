import { renderItem } from "@utils/render-item"
import * as React from "react"
import { Dimensions, View } from "react-native"
import { useSharedValue } from "react-native-reanimated"
import Carousel from "react-native-reanimated-carousel"

const defaultDataWith6Colors = ["#B0604D", "#899F9C", "#B3C680", "#5C6265", "#F5D399", "#F1F1F1"]

const CarouselComponent = () => {
	const scrollOffsetValue = useSharedValue<number>(0)
	const progress = useSharedValue<number>(0)
	const windowWidth = Dimensions.get("window").width

	return (
		<View id="carousel-component">
			<Carousel
				testID={"xxx"}
				loop={true}
				width={windowWidth}
				height={258}
				snapEnabled={true}
				pagingEnabled={true}
				autoPlayInterval={2000}
				data={defaultDataWith6Colors}
				defaultScrollOffsetValue={scrollOffsetValue}
				onScrollStart={() => {
					console.log("Scroll start")
				}}
				onScrollEnd={() => {
					console.log("Scroll end")
				}}
				onConfigurePanGesture={(g: { enabled: (arg0: boolean) => any }) => {
					"worklet"
					g.enabled(false)
				}}
				mode="parallax"
				modeConfig={{
					parallaxScrollingScale: 0.9,
					parallaxScrollingOffset: 50,
				}}
				onProgressChange={progress}
				onSnapToItem={(index: number) => console.log("current index:", index)}
				renderItem={renderItem({ rounded: true })}
			/>
		</View>
	)
}

export default CarouselComponent
