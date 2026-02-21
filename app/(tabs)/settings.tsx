import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Link } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@lib/themes/vars';
import { useSettingsStore } from '@stores/settings';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

type SettingsRow =
	| { type: 'link'; label: string; href: string; icon: keyof typeof Ionicons.glyphMap }
	| { type: 'action'; label: string; destructive?: boolean; onPress: () => void };

const settingsGroup: { title: string; rows: SettingsRow[] }[] = [
	{
		title: 'GENERAL',
		rows: [
			{ type: 'link', label: 'Appearance', href: '/settings/appearance', icon: 'color-palette-outline' },
			{ type: 'link', label: 'Reader', href: '/settings/reader', icon: 'book-outline' },
			{ type: 'link', label: 'Content Filters', href: '/settings/content', icon: 'funnel-outline' },
			{ type: 'link', label: 'Extensions', href: '/settings/extensions', icon: 'extension-puzzle-outline' },
		],
	},
	{
		title: 'ACCOUNT & DATA',
		rows: [
			{ type: 'link', label: 'Account', href: '/settings/account', icon: 'person-outline' },
			{ type: 'link', label: 'Backup & Restore', href: '/settings/backup', icon: 'cloud-upload-outline' },
			{ type: 'link', label: 'Security', href: '/settings/security', icon: 'lock-closed-outline' },
		],
	},
	{
		title: 'ABOUT',
		rows: [{ type: 'link', label: 'Install Extension', href: '/extensions/install', icon: 'download-outline' }],
	},
];

function SettingsGroupSection({ title, rows, themeColors }: { title: string; rows: SettingsRow[]; themeColors: ReturnType<typeof useThemeColors> }) {
	return (
		<View className="mb-6">
			<Text className="text-muted-foreground text-preset-1 mb-2 px-4 tracking-[0.15em] uppercase">{title}</Text>
			<View className="bg-card/50 mx-4 overflow-hidden rounded-2xl">
				{rows.map((row, index) => (
					<View key={row.label}>
						{row.type === 'link' ? (
							<Link href={row.href} asChild>
								<Pressable className="flex-row items-center px-4 py-3.5">
									<Ionicons name={row.icon} size={20} color={themeColors.foreground} style={{ width: 28 }} />
									<Text className="text-foreground text-preset-2 font-body flex-1">{row.label}</Text>
									<Ionicons name="chevron-forward" size={18} color={themeColors.muted} />
								</Pressable>
							</Link>
						) : (
							<Pressable className="flex-row items-center px-4 py-3.5" onPress={row.onPress}>
								<Text className={`text-preset-2 font-body flex-1 ${row.destructive ? 'text-error' : 'text-foreground'}`}>{row.label}</Text>
							</Pressable>
						)}
						{index < rows.length - 1 && <View className="bg-border/30 ml-[44px] h-px" />}
					</View>
				))}
			</View>
		</View>
	);
}

export default function Settings() {
	const theme = useSettingsStore((state) => state.theme);
	const tabBarPadding = useTabBarPadding(16);
	const themeColors = useThemeColors();
	const insets = useSafeAreaInsets();
	const headerHeight = 44 + insets.top;

	return (
		<View className="bg-background flex-1">
			<ScrollView
				className="flex-1"
				contentContainerStyle={{
					paddingTop: headerHeight + 8,
					paddingBottom: tabBarPadding,
				}}
				contentInsetAdjustmentBehavior="never"
			>
				{/* Theme preview card */}
				<View className="bg-card/50 mx-4 mb-6 overflow-hidden rounded-2xl p-4">
					<View className="flex-row items-center justify-between">
						<View>
							<Text className="text-muted-foreground text-preset-1 tracking-[0.15em] uppercase">Current Theme</Text>
							<Text className="text-foreground text-preset-3 font-heading mt-1 font-semibold capitalize">{theme}</Text>
						</View>
						<View className="flex-row gap-1.5">
							<View className="bg-primary h-8 w-8 rounded-full" />
							<View className="bg-accent h-8 w-8 rounded-full" />
							<View className="bg-secondary h-8 w-8 rounded-full" />
						</View>
					</View>
				</View>

				{settingsGroup.map((group) => (
					<SettingsGroupSection key={group.title} title={group.title} rows={group.rows} themeColors={themeColors} />
				))}

				{/* Version info */}
				<View className="items-center pt-4 pb-8">
					<Text className="text-muted text-preset-1 font-body">MangaVerse v0.1.0</Text>
				</View>
			</ScrollView>

			{/* Fixed header */}
			<View className="absolute top-0 right-0 left-0" style={{ zIndex: 10 }}>
				<View className="relative overflow-hidden">
					{Platform.OS === 'ios' ? (
						<BlurView intensity={80} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} />
					) : (
						<View className="bg-background/90" style={StyleSheet.absoluteFillObject} />
					)}
					<View style={{ paddingTop: insets.top, height: headerHeight }} className="flex-row items-center justify-center px-4">
						<Text className="text-foreground text-preset-2 font-heading font-semibold">Settings</Text>
					</View>
				</View>
			</View>
		</View>
	);
}
