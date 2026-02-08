import "../global.css"

import { Stack } from "expo-router/stack"
import { useEffect } from "react"

import { ensureImageResolveAssetSource } from "@lib/asset"
import { initializeDatabase } from "@services/db"

export default function Layout() {
	ensureImageResolveAssetSource()
	useEffect(() => {
		initializeDatabase()
	}, [])
	return (
		<Stack>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="search" options={{ presentation: "modal", title: "Search" }} />
			<Stack.Screen name="manga/[id]" options={{ headerShown: false }} />
			<Stack.Screen name="reader/[chapterId]" options={{ headerShown: false }} />
			<Stack.Screen name="settings/extensions" options={{ title: "Extensions" }} />
			<Stack.Screen name="settings/appearance" options={{ title: "Appearance" }} />
			<Stack.Screen name="settings/reader" options={{ title: "Reader" }} />
			<Stack.Screen name="settings/content" options={{ title: "Content" }} />
			<Stack.Screen name="settings/security" options={{ title: "Security" }} />
			<Stack.Screen name="settings/backup" options={{ title: "Backup & Restore" }} />
			<Stack.Screen name="settings/account" options={{ title: "Account" }} />
		</Stack>
	)
}
