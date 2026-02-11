import "react-native-url-polyfill/auto"

import { createClient } from "@supabase/supabase-js"
import * as SecureStore from "expo-secure-store"
import * as WebBrowser from "expo-web-browser"
import * as Linking from "expo-linking"

WebBrowser.maybeCompleteAuthSession()

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? ""
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

const storage = {
	getItem: (key: string) => SecureStore.getItemAsync(key),
	setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
	removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

type NoopAuth = {
	getSession: () => Promise<{ data: { session: null }; error: null }>
	onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
		data: { subscription: { unsubscribe: () => void } }
	}
	getSessionFromUrl: (params: { url: string }) => Promise<{ data: { session: null }; error: null }>
	setSession: (session: unknown) => Promise<{ data: { session: null }; error: null }>
	signInWithOtp: (params: { email: string; options?: { emailRedirectTo?: string } }) => Promise<{
		data: null
		error: Error
	}>
	verifyOtp: (params: { email: string; token: string; type: "email" }) => Promise<{
		data: null
		error: Error
	}>
	signInWithOAuth: (params: {
		provider: "google" | "apple" | "facebook" | "discord" | "github"
		options?: { redirectTo?: string }
	}) => Promise<{ data: null; error: Error }>
	signOut: () => Promise<{ error: null }>
}

const createNoopAuth = (): NoopAuth => ({
	getSession: async () => ({ data: { session: null }, error: null }),
	onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
	getSessionFromUrl: async () => ({ data: { session: null }, error: null }),
	setSession: async () => ({ data: { session: null }, error: null }),
	signInWithOtp: async () => ({ data: null, error: new Error("Supabase not configured") }),
	verifyOtp: async () => ({ data: null, error: new Error("Supabase not configured") }),
	signInWithOAuth: async () => ({ data: null, error: new Error("Supabase not configured") }),
	signOut: async () => ({ error: null }),
})

const createSupabaseClient = () => {
	if (!isSupabaseConfigured) {
		return { auth: createNoopAuth() }
	}
	return createClient(supabaseUrl, supabaseKey, {
		auth: {
			storage,
			autoRefreshToken: true,
			persistSession: true,
			detectSessionInUrl: false,
		},
	})
}

export const supabase = createSupabaseClient()

export function getRedirectUrl(path = "auth/callback") {
	return Linking.createURL(path)
}

export async function signInWithOtp(email: string) {
	if (!isSupabaseConfigured) {
		throw new Error("Supabase is not configured")
	}
	const result = await supabase.auth.signInWithOtp({
		email,
		options: { emailRedirectTo: getRedirectUrl() },
	})
	if (result.error) {
		throw result.error
	}
	return result
}

export async function verifyOtp(email: string, token: string) {
	if (!isSupabaseConfigured) {
		throw new Error("Supabase is not configured")
	}
	const result = await supabase.auth.verifyOtp({ email, token, type: "email" })
	if (result.error) {
		throw result.error
	}
	return result
}

export async function signInWithProvider(provider: "google" | "apple" | "facebook" | "discord" | "github") {
	if (!isSupabaseConfigured) {
		throw new Error("Supabase is not configured")
	}
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
