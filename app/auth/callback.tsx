import { useEffect } from "react"
import { ActivityIndicator, Text, View } from "react-native"
import * as Linking from "expo-linking"

import { isSupabaseConfigured, supabase } from "@services/auth/supabase"

export default function AuthCallback() {
	useEffect(() => {
		if (!isSupabaseConfigured) {
			return
		}
		const handleAuth = async () => {
			const url = await Linking.getInitialURL()
			if (!url) {
				return
			}
			const { data, error } = await supabase.auth.getSessionFromUrl({ url })
			if (error) {
				return
			}
			await supabase.auth.setSession(data.session)
		}
		handleAuth().catch(() => {})
	}, [])
	return (
		<View className="flex-1 items-center justify-center bg-neutral-950">
			{isSupabaseConfigured ? (
				<>
					<ActivityIndicator color="#ff9900" />
					<Text className="mt-3 text-sm text-neutral-400">Signing you in…</Text>
				</>
			) : (
				<Text className="text-sm text-neutral-400">Supabase is not configured.</Text>
			)}
		</View>
	)
}
