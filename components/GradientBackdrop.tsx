import { View } from 'react-native';

export function GradientBackdrop() {
	return (
		<View className="absolute inset-0">
			<View className="bg-background absolute inset-0" />
		</View>
	);
}
