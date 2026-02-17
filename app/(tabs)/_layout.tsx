import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { useThemeColors } from '@lib/themes/vars';
export default function TabLayout() {
	const themeColors = useThemeColors();
	return (
		<NativeTabs backgroundColor={themeColors.background} disableTransparentOnScrollEdge>
			<NativeTabs.Trigger name="library">
				<Label>Library</Label>
				<Icon sf="books.vertical" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="discover">
				<Label>Discover</Label>
				<Icon sf="safari" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="history">
				<Label>History</Label>
				<Icon sf="clock" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<Label>Home</Label>
				<Icon sf="gear" />
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
