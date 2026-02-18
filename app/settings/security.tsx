import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';

export default function SecuritySettings() {
	return (
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Security" subtitle="App lock & biometrics" />
				<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-2 font-heading font-semibold text-foreground">App lock</Text>
					<Text className="mt-2 text-preset-1 font-body text-muted">Enable biometrics to protect the app.</Text>
				</View>
			</ScrollView>
		</View>
	);
}
