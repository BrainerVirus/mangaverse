import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';

export default function SecuritySettings() {
	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Security" subtitle="App lock & biometrics" />
				<View className="border-border/30 bg-card/70 rounded-[28px] border p-5">
					<Text className="text-preset-2 font-heading text-foreground font-semibold">App lock</Text>
					<Text className="text-preset-1 font-body text-muted mt-2">Enable biometrics to protect the app.</Text>
				</View>
			</ScrollView>
		</View>
	);
}
