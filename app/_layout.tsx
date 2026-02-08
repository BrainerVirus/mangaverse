import "../global.css"

import { Stack } from "expo-router/stack"
import { useEffect } from "react"

import { ensureImageResolveAssetSource } from "@lib/asset"
import { initializeDatabase } from "@services/db"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"

import { supabase } from "@services/auth/supabase"
import { useAuthStore } from "@stores/auth"

export default function Layout() {
	ensureImageResolveAssetSource()
	const setSession = useAuthStore((state) => state.setSession)
	const setLoading = useAuthStore((state) => state.setLoading)
	useEffect(() => {
		initializeDatabase()
	}, [])
	useEffect(() => {
		let active = true
		supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
			const data = result.data
			if (!active) {
				return
			}
			setSession(data.session ?? null)
			setLoading(false)
		})
		const { data } = supabase.auth.onAuthStateChange(
			(event: AuthChangeEvent, session: Session | null) => {
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
