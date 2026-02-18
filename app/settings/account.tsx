import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { useThemeColors } from '@lib/themes/vars';
import { isSupabaseConfigured, signInWithOtp, signInWithProvider, signOut, verifyOtp } from '@services/auth/supabase';
import { useAuthStore } from '@stores/auth';

export default function AccountSettings() {
	const [email, setEmail] = useState('');
	const [otp, setOtp] = useState('');
	const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle');
	const [error, setError] = useState<string | null>(null);
	const session = useAuthStore((state) => state.session);
	const themeColors = useThemeColors();

	const handleMagicLink = async () => {
		setError(null);
		if (!email) {
			setError('Enter your email address first.');
			return;
		}
		setStatus('sending');
		try {
			await signInWithOtp(email);
			setStatus('sent');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to send magic link');
			setStatus('idle');
		}
	};

	const handleVerify = async () => {
		setError(null);
		if (!email || !otp) {
			setError('Enter your email and one-time code.');
			return;
		}
		setStatus('verifying');
		try {
			await verifyOtp(email, otp);
			setStatus('idle');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to verify code');
			setStatus('idle');
		}
	};
	return (
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Account" subtitle="Optional login" />
				<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-2 font-heading font-semibold text-foreground">Supabase account</Text>
					<Text className="mt-2 text-preset-1 font-body text-muted">Sign in to enable sync and backups across devices.</Text>
					{!isSupabaseConfigured ? (
						<View className="mt-3 rounded-[22px] border border-warning/40 bg-warning/10 px-4 py-3">
							<Text className="text-preset-1 tracking-[0.2em] text-warning uppercase">Supabase not configured</Text>
							<Text className="mt-2 text-preset-1 font-body text-warning">
								Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY to your .env to enable auth.
							</Text>
						</View>
					) : null}
					<Link
						href="/settings/auth-help"
						className="mt-3 rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-foreground uppercase"
					>
						Auth setup help
					</Link>
					{session ? (
						<Text
							className="mt-4 rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-foreground uppercase"
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
								placeholderTextColor={themeColors.mutedForeground}
								className="rounded-2xl border border-border/40 bg-background px-4 py-3 text-preset-1 font-body text-foreground"
								autoCapitalize="none"
								autoCorrect={false}
								keyboardType="email-address"
							/>
							<Text
								className={`rounded-full px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] uppercase ${
									status === 'sending' ? 'bg-chip text-muted' : 'bg-accent text-accent-foreground'
								}`}
								onPress={status === 'sending' ? undefined : handleMagicLink}
							>
								{status === 'sending' ? 'Sending…' : 'Send magic link'}
							</Text>
							<TextInput
								value={otp}
								onChangeText={setOtp}
								placeholder="One-time code"
								placeholderTextColor={themeColors.mutedForeground}
								className="rounded-2xl border border-border/40 bg-background px-4 py-3 text-preset-1 font-body text-foreground"
								keyboardType="number-pad"
							/>
							<Text
								className={`rounded-full px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] uppercase ${
									status === 'verifying' ? 'bg-chip text-muted' : 'bg-chip text-foreground'
								}`}
								onPress={status === 'verifying' ? undefined : handleVerify}
							>
								{status === 'verifying' ? 'Verifying…' : 'Verify code'}
							</Text>
							<View className="flex-row flex-wrap gap-2">
								<Text
									className="rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-foreground uppercase"
									onPress={() => signInWithProvider('google')}
								>
									Google
								</Text>
								<Text
									className="rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-foreground uppercase"
									onPress={() => signInWithProvider('apple')}
								>
									Apple
								</Text>
								<Text
									className="rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-foreground uppercase"
									onPress={() => signInWithProvider('facebook')}
								>
									Facebook
								</Text>
								<Text
									className="rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-foreground uppercase"
									onPress={() => signInWithProvider('discord')}
								>
									Discord
								</Text>
								<Text
									className="rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-semibold tracking-[0.2em] text-foreground uppercase"
									onPress={() => signInWithProvider('github')}
								>
									GitHub
								</Text>
							</View>
							{status === 'sent' ? (
								<Text className="text-preset-1 text-muted">Check your email for the magic link or enter the OTP code above.</Text>
							) : null}
							{error ? <Text className="text-preset-1 text-error">{error}</Text> : null}
						</View>
					)}
				</View>
			</ScrollView>
		</View>
	);
}
