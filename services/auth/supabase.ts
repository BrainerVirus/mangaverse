import "react-native-url-polyfill/auto"

import { createClient } from "@supabase/supabase-js"
import * as SecureStore from "expo-secure-store"
import * as WebBrowser from "expo-web-browser"
import * as Linking from "expo-linking"

WebBrowser.maybeCompleteAuthSession()

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? ""

const storage = {
	getItem: (key: string) => SecureStore.getItemAsync(key),
	setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
	removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: {
		storage,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: false,
	},
})

export function getRedirectUrl(path = "auth/callback") {
	return Linking.createURL(path)
}

export async function signInWithOtp(email: string) {
	return supabase.auth.signInWithOtp({
		email,
		options: { emailRedirectTo: getRedirectUrl() },
	})
}

export async function verifyOtp(email: string, token: string) {
	return supabase.auth.verifyOtp({ email, token, type: "email" })
}

export async function signInWithProvider(provider: "google" | "apple" | "facebook" | "discord" | "github") {
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider,
		options: { redirectTo: getRedirectUrl() },
	})
	if (error || !data?.url) {
		throw error ?? new Error("Failed to start OAuth")
	}
	const result = await WebBrowser.openAuthSessionAsync(data.url, getRedirectUrl())
	if (result.type !== "success") {
		throw new Error("OAuth cancelled")
	}
	return result
}

export async function signOut() {
	return supabase.auth.signOut()
}
