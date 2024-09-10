import { Link } from "expo-router"
import { Text, View } from "react-native"

export function Main() {
	return (
		<View className="justify-center bg-white">
			<Text className="text-black">Open up App.tsx to start working on your app!</Text>
			<Link href="/about">About</Link>
		</View>
	)
}
