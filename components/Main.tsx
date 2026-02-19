import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export function Main() {
	return (
		<View className="bg-background justify-center">
			<Text className="text-foreground">Open up App.tsx to start working on your app!</Text>
			<Link href="/about">About</Link>
		</View>
	);
}
