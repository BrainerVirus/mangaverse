import Feather from "@expo/vector-icons/Feather"
import { Tabs } from "expo-router"

export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				tabBarShowLabel: false,
				headerTitleAlign: "center",
				tabBarActiveTintColor: "#ff9900",
			}}
		>
			<Tabs.Screen
				name="discover"
				options={{
					title: "Discorver",
					tabBarIcon: ({ color }) => <Feather size={28} name="book-open" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="search"
				options={{
					title: "Search",
					tabBarIcon: ({ color }) => <Feather size={28} name="search" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="library"
				options={{
					title: "Library",
					tabBarIcon: ({ color }) => <Feather size={28} name="bookmark" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="history"
				options={{
					title: "History",
					tabBarIcon: ({ color }) => <Feather size={28} name="clock" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: "Settings",
					tabBarIcon: ({ color }) => <Feather size={28} name="settings" color={color} />,
				}}
			/>
		</Tabs>
	)
}
