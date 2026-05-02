import '../global.css';

import { VariableContextProvider } from 'nativewind';

import { Stack } from 'expo-router/stack';
import { useEffect, useMemo, useState } from 'react';
import { useColorScheme, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Sidebar from '@components/ui/Sidebar';
import { useKeyboardShortcuts } from '@hooks/useKeyboardShortcuts';
import { AUTO_INSTALL_MANGADEX } from '@lib/constants';
import { PlatformInfo } from '@lib/platform';
import { getThemeVars } from '@lib/themes/vars';
import { isSupabaseConfigured, supabase } from '@services/auth/supabase';
import { initializeDatabase } from '@services/db';
import { installExtension, loadInstalledExtensions, saveInstalledExtensions } from '@services/extensions/manager';
import { fetchExtensionIndex } from '@services/extensions/repository';
import { useAuthStore } from '@stores/auth';
import { useExtensionsStore } from '@stores/extensions';
import { useSettingsStore } from '@stores/settings';

export default function Layout() {
	const setSession = useAuthStore((state) => state.setSession);
	const setLoading = useAuthStore((state) => state.setLoading);
	const refreshProviders = useExtensionsStore((state) => state.refreshProviders);
	const theme = useSettingsStore((state) => state.theme);
	const colorScheme = useColorScheme();
	const resolvedScheme = colorScheme === 'light' ? 'light' : 'dark';
	const themeVars = useMemo(() => getThemeVars(theme, resolvedScheme), [theme, resolvedScheme]);
	const { width } = useWindowDimensions();
	const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
	const isDesktopLayout = PlatformInfo.isWeb && width >= 1024;

	useKeyboardShortcuts({
		onToggleSidebar: () => setSidebarCollapsed((prev) => !prev),
		onRefreshDiscover: () => refreshProviders().catch(() => {}),
	});
	useEffect(() => {
		initializeDatabase();
	}, []);
	useEffect(() => {
		refreshProviders().catch(() => {});
	}, [refreshProviders]);
	useEffect(() => {
		if (!AUTO_INSTALL_MANGADEX) {
			return;
		}
		const ensureMangaDex = async () => {
			const installed = await loadInstalledExtensions();
			if (installed.some((entry) => entry.id === 'mangadex')) {
				return;
			}
			const index = await fetchExtensionIndex(process.env.EXPO_PUBLIC_EXTENSION_REPO);
			const item = index.find((entry) => entry.id === 'mangadex');
			if (!item) {
				return;
			}
			const extension = await installExtension(item);
			const next = [...installed, { ...extension, order: installed.length }];
			await saveInstalledExtensions(next);
			await refreshProviders();
		};
		ensureMangaDex().catch(() => {});
	}, [refreshProviders]);
	useEffect(() => {
		if (!isSupabaseConfigured) {
			setSession(null);
			setLoading(false);
			return;
		}
		let active = true;
		supabase.auth.getSession().then((result: { data: { session: unknown } }) => {
			const data = result.data;
			if (!active) {
				return;
			}
			setSession((data as { session: unknown }).session ?? null);
			setLoading(false);
		});
		const { data } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
			if (event === 'SIGNED_OUT') {
				setSession(null);
				return;
			}
			setSession(session ?? null);
		});
		return () => {
			active = false;
			data.subscription.unsubscribe();
		};
	}, [setLoading, setSession]);
	return (
		<VariableContextProvider value={themeVars}>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<SafeAreaProvider>
					{isDesktopLayout ? (
						<View className="bg-background flex-1 flex-row">
							<Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />
							<View className="flex-1">
								<Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
									<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
									<Stack.Screen name="search" options={{ headerShown: false }} />
									<Stack.Screen name="discover/[sectionId]" options={{ headerShown: false }} />
									<Stack.Screen name="manga/[id]" options={{ headerShown: false }} />
									<Stack.Screen name="reader/[chapterId]" options={{ headerShown: false }} />
									<Stack.Screen name="extensions/install" options={{ title: 'Install Extension' }} />
									<Stack.Screen name="settings/extensions" options={{ title: 'Extensions' }} />
									<Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
									<Stack.Screen name="settings/reader" options={{ title: 'Reader' }} />
									<Stack.Screen name="settings/content" options={{ title: 'Content' }} />
									<Stack.Screen name="settings/security" options={{ title: 'Security' }} />
									<Stack.Screen name="settings/backup" options={{ title: 'Backup & Restore' }} />
									<Stack.Screen name="settings/account" options={{ title: 'Account' }} />
									<Stack.Screen name="settings/auth-help" options={{ title: 'Auth Setup' }} />
									<Stack.Screen name="auth/callback" options={{ headerShown: false }} />
								</Stack>
							</View>
						</View>
					) : (
						<View className="bg-background flex-1">
							<Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
								<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
								<Stack.Screen name="search" options={{ headerShown: false }} />
								<Stack.Screen name="discover/[sectionId]" options={{ headerShown: false }} />
								<Stack.Screen name="manga/[id]" options={{ headerShown: false }} />
								<Stack.Screen name="reader/[chapterId]" options={{ headerShown: false }} />
								<Stack.Screen name="extensions/install" options={{ title: 'Install Extension' }} />
								<Stack.Screen name="settings/extensions" options={{ title: 'Extensions' }} />
								<Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
								<Stack.Screen name="settings/reader" options={{ title: 'Reader' }} />
								<Stack.Screen name="settings/content" options={{ title: 'Content' }} />
								<Stack.Screen name="settings/security" options={{ title: 'Security' }} />
								<Stack.Screen name="settings/backup" options={{ title: 'Backup & Restore' }} />
								<Stack.Screen name="settings/account" options={{ title: 'Account' }} />
								<Stack.Screen name="settings/auth-help" options={{ title: 'Auth Setup' }} />
								<Stack.Screen name="auth/callback" options={{ headerShown: false }} />
							</Stack>
						</View>
					)}
				</SafeAreaProvider>
			</GestureHandlerRootView>
		</VariableContextProvider>
	);
}
