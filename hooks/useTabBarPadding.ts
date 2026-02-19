import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useTabBarPadding(extra = 0) {
	const insets = useSafeAreaInsets();
	const base = Platform.OS === 'ios' ? 49 : 56;
	return base + insets.bottom + extra;
}
