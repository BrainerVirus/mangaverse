import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { PlatformInfo } from '@lib/platform';
import { useThemeColors } from '@lib/themes/vars';
import { isSupabaseConfigured, supabase } from '@services/auth/supabase';

export default function AuthCallback() {
	const themeColors = useThemeColors();
	useEffect(() => {
		if (!isSupabaseConfigured) {
			return;
		}
		const handleAuth = async () => {
			let url: string | null = null;

			if (PlatformInfo.isWeb) {
				url = window.location.href;
			} else {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const Linking = require('expo-linking');
				url = await Linking.getInitialURL();
			}

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
		<View className="bg-background flex-1 items-center justify-center">
			{isSupabaseConfigured ? (
				<>
					<ActivityIndicator color={themeColors.accent} />
					<Text className="text-preset-1 font-body text-muted mt-3">Signing you in…</Text>
				</>
			) : (
				<Text className="text-preset-1 font-body text-muted">Supabase is not configured.</Text>
			)}
		</View>
	);
}
