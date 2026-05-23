import { PlatformInfo } from '@lib/platform';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useTabBarPadding(extra = 0) {
	const insets = useSafeAreaInsets();
	const base = PlatformInfo.isIOS ? 49 : 56;
	return base + insets.bottom + extra;
}
