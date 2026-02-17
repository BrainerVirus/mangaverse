import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';

export default function AuthHelp() {
	return (
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Auth Setup" subtitle="Supabase configuration" />
				<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-3 font-heading font-semibold text-foreground">Required settings</Text>
					<Text className="text-preset-2 font-body text-muted mt-2">Add redirect URLs in Supabase Auth settings for magic links and OAuth.</Text>
					<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase mt-4">Production</Text>
					<Text className="text-preset-1 font-body text-foreground mt-2 rounded-2xl border border-border/30 bg-background/70 px-3 py-2">
						mangaverse://auth/callback
					</Text>
					<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase mt-4">Expo dev</Text>
					<Text className="text-preset-1 font-body text-foreground mt-2 rounded-2xl border border-border/30 bg-background/70 px-3 py-2">
						exp://&lt;your-dev-host&gt;/--/auth/callback
					</Text>
					<Text className="text-preset-2 font-body text-muted mt-4">
						Enable Google, Apple, Facebook, Discord, and GitHub providers in Supabase Auth settings, and set the redirect URL to the callback above.
					</Text>
				</View>
			</ScrollView>
		</View>
	);
}
