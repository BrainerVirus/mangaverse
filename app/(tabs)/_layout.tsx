import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { useThemeColors } from '@lib/themes/vars';
export default function TabLayout() {
	const themeColors = useThemeColors();
	return (
		<NativeTabs backgroundColor={themeColors.background} disableTransparentOnScrollEdge>
			<NativeTabs.Trigger name="discover">
				<Label>Discover</Label>
				<Icon sf="book" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="search">
				<Label>Search</Label>
				<Icon sf="magnifyingglass" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="library">
				<Label>Library</Label>
				<Icon sf="bookmark" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="history">
				<Label>History</Label>
				<Icon sf="clock" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<Label>Settings</Label>
				<Icon sf="gear" />
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
