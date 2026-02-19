import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { useSettingsStore } from '@stores/settings';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

const sections = [
	{
		id: 'appearance',
		title: 'Appearance',
		description: 'Theme, library layout, AMOLED',
		link: '/settings/appearance',
	},
	{
		id: 'reader',
		title: 'Reader',
		description: 'Defaults, tap zones, prefetch',
		link: '/settings/reader',
	},
	{
		id: 'content',
		title: 'Content filters',
		description: 'Safe, suggestive, explicit',
		link: '/settings/content',
	},
	{
		id: 'extensions',
		title: 'Extensions',
		description: 'Repo URL, install, languages',
		link: '/settings/extensions',
	},
	{
		id: 'security',
		title: 'Security',
		description: 'App lock & biometrics',
		link: '/settings/security',
	},
	{
		id: 'backup',
		title: 'Backup & restore',
		description: 'Export local JSON and sync',
		link: '/settings/backup',
	},
	{
		id: 'account',
		title: 'Account',
		description: 'Optional Better Auth login',
		link: '/settings/account',
	},
];

export default function Settings() {
	const theme = useSettingsStore((state) => state.theme);
	const tabBarPadding = useTabBarPadding(24);
	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabBarPadding }}>
				<SectionHeading title="Settings" subtitle="Tune your experience" />
				<View className="border-border/30 bg-card/70 mb-6 rounded-[28px] border p-5">
					<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Theme</Text>
					<Text className="text-preset-2 font-heading text-foreground mt-2 font-semibold">{theme}</Text>
					<Text className="text-preset-1 font-body text-muted mt-1">Appearance applies across the reader and library.</Text>
				</View>
				<View className="gap-4 pb-12">
					{sections.map((section) => (
						<Link key={section.id} href={section.link} className="border-border/30 bg-card/70 rounded-[26px] border p-5">
							<Text className="text-preset-2 font-heading text-foreground font-semibold">{section.title}</Text>
							<Text className="text-preset-1 font-body text-muted mt-2">{section.description}</Text>
						</Link>
					))}
				</View>
			</ScrollView>
		</View>
	);
}
