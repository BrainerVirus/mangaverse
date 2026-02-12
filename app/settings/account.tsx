import { Link } from "expo-router"
import { useState } from "react"
import { ScrollView, Text, TextInput, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import {
	isSupabaseConfigured,
	signInWithOtp,
	signInWithProvider,
	signOut,
	verifyOtp,
} from "@services/auth/supabase"
import { useAuthStore } from "@stores/auth"

export default function AccountSettings() {
	const [email, setEmail] = useState("")
	const [otp, setOtp] = useState("")
	const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying">("idle")
	const [error, setError] = useState<string | null>(null)
	const session = useAuthStore((state) => state.session)

	const handleMagicLink = async () => {
		setError(null)
		if (!email) {
			setError("Enter your email address first.")
			return
		}
		setStatus("sending")
		try {
			await signInWithOtp(email)
			setStatus("sent")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send magic link")
			setStatus("idle")
		}
	}

	const handleVerify = async () => {
		setError(null)
		if (!email || !otp) {
			setError("Enter your email and one-time code.")
			return
		}
		setStatus("verifying")
		try {
			await verifyOtp(email, otp)
			setStatus("idle")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to verify code")
			setStatus("idle")
		}
	}
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Account" subtitle="Optional login" />
				<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Supabase account</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						Sign in to enable sync and backups across devices.
					</Text>
					{!isSupabaseConfigured ? (
						<View className="mt-3 rounded-[22px] border border-amber-500/40 bg-amber-500/10 px-4 py-3">
							<Text className="text-xs tracking-[0.2em] text-amber-200 uppercase">
								Supabase not configured
							</Text>
							<Text className="mt-2 text-sm text-amber-100">
								Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY to your .env to enable
								auth.
							</Text>
						</View>
					) : null}
					<Link
						href="/settings/auth-help"
						className="mt-3 rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-200 uppercase"
					>
						Auth setup help
					</Link>
					{session ? (
						<Text
							className="mt-4 rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-200 uppercase"
							onPress={() => signOut()}
						>
							Sign out
						</Text>
					) : (
						<View className="mt-4 gap-3">
							<TextInput
								value={email}
								onChangeText={setEmail}
								placeholder="Email"
								placeholderTextColor="#7b7b88"
								className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white"
								autoCapitalize="none"
								autoCorrect={false}
								keyboardType="email-address"
							/>
							<Text
								className={`rounded-full px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] uppercase ${
									status === "sending"
										? "bg-neutral-800 text-neutral-300"
										: "bg-amber-500 text-neutral-950"
								}`}
								onPress={status === "sending" ? undefined : handleMagicLink}
							>
								{status === "sending" ? "Sending…" : "Send magic link"}
							</Text>
							<TextInput
								value={otp}
								onChangeText={setOtp}
								placeholder="One-time code"
								placeholderTextColor="#7b7b88"
								className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white"
								keyboardType="number-pad"
							/>
							<Text
								className={`rounded-full px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] uppercase ${
									status === "verifying"
										? "bg-neutral-800 text-neutral-300"
										: "bg-neutral-800 text-neutral-200"
								}`}
								onPress={status === "verifying" ? undefined : handleVerify}
							>
								{status === "verifying" ? "Verifying…" : "Verify code"}
							</Text>
							<View className="flex-row flex-wrap gap-2">
								<Text
									className="rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-200 uppercase"
									onPress={() => signInWithProvider("google")}
								>
									Google
								</Text>
								<Text
									className="rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-200 uppercase"
									onPress={() => signInWithProvider("apple")}
								>
									Apple
								</Text>
								<Text
									className="rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-200 uppercase"
									onPress={() => signInWithProvider("facebook")}
								>
									Facebook
								</Text>
								<Text
									className="rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-200 uppercase"
									onPress={() => signInWithProvider("discord")}
								>
									Discord
								</Text>
								<Text
									className="rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-200 uppercase"
									onPress={() => signInWithProvider("github")}
								>
									GitHub
								</Text>
							</View>
							{status === "sent" ? (
								<Text className="text-xs text-neutral-400">
									Check your email for the magic link or enter the OTP code above.
								</Text>
							) : null}
							{error ? <Text className="text-xs text-red-400">{error}</Text> : null}
						</View>
					)}
				</View>
			</ScrollView>
		</View>
	)
}
