const EXPO_OS = typeof process !== 'undefined' ? process.env.EXPO_OS : undefined;

function isWebRuntime(): boolean {
	if (EXPO_OS === 'web') return true;
	if (typeof document !== 'undefined') return true;
	return false;
}

function isDesktopRuntime(): boolean {
	if (!isWebRuntime()) return false;
	try {
		return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
	} catch {
		return false;
	}
}

function isMobileRuntime(): boolean {
	if (EXPO_OS === 'ios' || EXPO_OS === 'android') return true;
	return false;
}

export const PlatformInfo = {
	get OS() {
		return EXPO_OS ?? (isWebRuntime() ? 'web' : 'unknown');
	},

	isWeb: isWebRuntime(),
	isDesktop: isDesktopRuntime(),
	isMobile: isMobileRuntime(),

	isNative: EXPO_OS === 'ios' || EXPO_OS === 'android',
	isIOS: EXPO_OS === 'ios',
	isAndroid: EXPO_OS === 'android',

	isTauri: isDesktopRuntime(),

	isServer: typeof window === 'undefined' && typeof document === 'undefined',
} as const;
