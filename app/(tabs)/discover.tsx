import { Image, ScrollView, Text, View } from "react-native"

export default function Discorver() {
	return (
		<ScrollView className="bg-white">
			<Text className="mb-8 text-base font-normal text-black">
				Lorem ipsum dolor sit amet consectetur, adipisicing elit. Maxime, distinctio.
			</Text>
			<View>
				<Image
					source={{
						uri: "https://reactnative.dev/img/tiny_logo.png",
					}}
					className="h-12 w-12"
				></Image>
			</View>
		</ScrollView>
	)
}
