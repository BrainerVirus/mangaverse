import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useThemeColors } from '@lib/themes/vars';
import { isSupabaseConfigured, supabase } from '@services/auth/supabase';

export default function AuthCallback() {
	const themeColors = useThemeColors();
	useEffect(() => {
		if (!isSupabaseConfigured) {
			return;
		}
		const handleAuth = async () => {
			const url = await Linking.getInitialURL();
			if (!url) {
				return;
			}
			const { data, error } = await supabase.auth.exchangeCodeForSession(url);
			if (error || !data?.session) {
				return;
			}
			await supabase.auth.setSession({
				access_token: data.session.access_token,
				refresh_token: data.session.refresh_token,
			});
		};
		handleAuth().catch(() => {});
	}, []);
	return (
		<View className="flex-1 items-center justify-center bg-background">
			{isSupabaseConfigured ? (
				<>
					<ActivityIndicator color={themeColors.accent} />
					<Text className="mt-3 text-preset-1 font-body text-muted">Signing you in…</Text>
				</>
			) : (
				<Text className="text-preset-1 font-body text-muted">Supabase is not configured.</Text>
			)}
		</View>
	);
}
