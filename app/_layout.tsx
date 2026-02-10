import "../global.css"

import { Stack } from "expo-router/stack"
import { useEffect } from "react"

import { AUTO_INSTALL_MANGADEX } from "@lib/constants"
import { installExtension, loadInstalledExtensions, saveInstalledExtensions } from "@services/extensions/manager"
import { fetchExtensionIndex } from "@services/extensions/repository"
import { initializeDatabase } from "@services/db"
import { isSupabaseConfigured, supabase } from "@services/auth/supabase"
import { useAuthStore } from "@stores/auth"
import { useExtensionsStore } from "@stores/extensions"

	
export default function Layout() {
	const setSession = useAuthStore((state) => state.setSession)
	const setLoading = useAuthStore((state) => state.setLoading)
	const refreshProviders = useExtensionsStore((state) => state.refreshProviders)
	useEffect(() => {
		initializeDatabase()
	}, [])
	useEffect(() => {
		refreshProviders().catch(() => {})
	}, [refreshProviders])
	useEffect(() => {
		if (!AUTO_INSTALL_MANGADEX) {
			return
		}
		const ensureMangaDex = async () => {
			const installed = await loadInstalledExtensions()
			if (installed.some((entry) => entry.id === "mangadex")) {
				return
			}
			const repo = process.env.EXPO_PUBLIC_EXTENSION_REPO || undefined
			const index = await fetchExtensionIndex(repo)
			const item = index.find((entry) => entry.id === "mangadex")
			if (!item) {
				return
			}
			const extension = await installExtension(item)
			const next = [...installed, { ...extension, order: installed.length }]
			await saveInstalledExtensions(next)
			await refreshProviders()
		}
		ensureMangaDex().catch(() => {})
	}, [refreshProviders])
	useEffect(() => {
		if (!isSupabaseConfigured) {
			setSession(null)
			setLoading(false)
			return
		}
		let active = true
		supabase.auth.getSession().then((result: { data: { session: unknown } }) => {
			const data = result.data
			if (!active) {
				return
			}
			setSession((data as { session: unknown }).session ?? null)
			setLoading(false)
		})
		const { data } = supabase.auth.onAuthStateChange(
			(event: string, session: unknown) => {
				if (event === "SIGNED_OUT") {
					setSession(null)
					return
				}
				setSession(session ?? null)
			}
		)
		return () => {
			active = false
			data.subscription.unsubscribe()
		}
	}, [setLoading, setSession])
	return (
		<Stack>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="search" options={{ presentation: "modal", title: "Search" }} />
			<Stack.Screen name="manga/[id]" options={{ headerShown: false }} />
			<Stack.Screen name="reader/[chapterId]" options={{ headerShown: false }} />
			<Stack.Screen name="extensions/install" options={{ title: "Install Extension" }} />
			<Stack.Screen name="settings/extensions" options={{ title: "Extensions" }} />
			<Stack.Screen name="settings/appearance" options={{ title: "Appearance" }} />
			<Stack.Screen name="settings/reader" options={{ title: "Reader" }} />
			<Stack.Screen name="settings/content" options={{ title: "Content" }} />
			<Stack.Screen name="settings/security" options={{ title: "Security" }} />
			<Stack.Screen name="settings/backup" options={{ title: "Backup & Restore" }} />
			<Stack.Screen name="settings/account" options={{ title: "Account" }} />
			<Stack.Screen name="settings/auth-help" options={{ title: "Auth Setup" }} />
			<Stack.Screen name="auth/callback" options={{ headerShown: false }} />
		</Stack>
	)
}
