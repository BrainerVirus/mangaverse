import { usePathname } from "expo-router"
import { Tabs, TabList, TabSlot, TabTrigger } from "expo-router/ui"
import { Pressable, Text, useWindowDimensions, View } from "react-native"

import { Icon } from "@components/Icon"

import { BookOpen, Compass, History, Settings } from "lucide-react-native"

export default function WebTabsLayout() {
	const { width } = useWindowDimensions()
	const isDesktop = width >= 1024
	const pathname = usePathname()
	const activeColor = "#ff6b6b"
	const inactiveColor = "#e5e5ea"
	const isActive = (segment: string) =>
		pathname === `/${segment}` || pathname.startsWith(`/${segment}/`)
	const libraryActive = isActive("library")
	const discoverActive = isActive("discover")
	const historyActive = isActive("history")
	const settingsActive = isActive("settings")
	const tabBar = (
		<TabList
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: 16,
				paddingHorizontal: 20,
				paddingVertical: 12,
				backgroundColor: "#0b0b0d",
				borderTopWidth: isDesktop ? 0 : 1,
				borderBottomWidth: isDesktop ? 1 : 0,
				borderColor: "#1b1b1f",
				position: isDesktop ? "relative" : "absolute",
				left: 0,
				right: 0,
				bottom: isDesktop ? undefined : 0,
				zIndex: 20,
			}}
		>
			<TabTrigger name="library" href="/library" asChild>
				<Pressable style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
					<Icon
						icon={BookOpen}
						size={18}
						color={libraryActive ? activeColor : inactiveColor}
						fill={libraryActive ? activeColor : "transparent"}
					/>
					<Text
						style={{
							color: libraryActive ? activeColor : inactiveColor,
							fontSize: 13,
							fontWeight: "600",
						}}
					>
						Library
					</Text>
				</Pressable>
			</TabTrigger>
			<TabTrigger name="discover" href="/discover" asChild>
				<Pressable style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
					<Icon icon={Compass} size={18} color={discoverActive ? activeColor : inactiveColor} />
					<Text
						style={{
							color: discoverActive ? activeColor : inactiveColor,
							fontSize: 13,
							fontWeight: "600",
						}}
					>
						Discover
					</Text>
				</Pressable>
			</TabTrigger>
			<TabTrigger name="history" href="/history" asChild>
				<Pressable style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
					<Icon icon={History} size={18} color={historyActive ? activeColor : inactiveColor} />
					<Text
						style={{
							color: historyActive ? activeColor : inactiveColor,
							fontSize: 13,
							fontWeight: "600",
						}}
					>
						History
					</Text>
				</Pressable>
			</TabTrigger>
			<TabTrigger name="settings" href="/settings" asChild>
				<Pressable style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
					<Icon icon={Settings} size={18} color={settingsActive ? activeColor : inactiveColor} />
					<Text
						style={{
							color: settingsActive ? activeColor : inactiveColor,
							fontSize: 13,
							fontWeight: "600",
						}}
					>
						Home
					</Text>
				</Pressable>
			</TabTrigger>
		</TabList>
	)
	return (
		<Tabs>
			{isDesktop ? tabBar : null}
			<View style={{ flex: 1, paddingBottom: isDesktop ? 0 : 64 }}>
				<TabSlot />
			</View>
			{isDesktop ? null : tabBar}
		</Tabs>
	)
}
