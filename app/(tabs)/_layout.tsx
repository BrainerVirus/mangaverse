import { Tabs } from 'expo-router/tabs';
import { useWindowDimensions } from 'react-native';

import { Ionicons } from '@components/icons';
import { PlatformInfo } from '@lib/platform';
import { useThemeColors } from '@lib/themes/vars';

export default function TabLayout() {
	const themeColors = useThemeColors();
	const { width } = useWindowDimensions();
	const isDesktop = PlatformInfo.isWeb && width >= 1024;

	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: themeColors.primary,
				tabBarInactiveTintColor: themeColors.mutedForeground,
				tabBarStyle: {
					backgroundColor: themeColors.background,
					borderTopColor: themeColors.border,
					display: isDesktop ? 'none' : 'flex',
				},
				headerShown: false,
			}}
		>
			<Tabs.Screen
				name="discover"
				options={{
					title: 'Discover',
					tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="search"
				options={{
					title: 'Search',
					tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="library"
				options={{
					title: 'Library',
					tabBarIcon: ({ color, size }) => <Ionicons name="bookmarks" size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="history"
				options={{
					title: 'History',
					tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: 'Settings',
					tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
				}}
			/>
		</Tabs>
	);
}
