import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

interface UseReaderChromeOptions {
	autoHideChrome: boolean;
	showSettings: boolean;
	resetTrigger?: number;
}

interface UseReaderChromeResult {
	chromeVisible: boolean;
	setChromeVisible: (v: boolean) => void;
	chromeOpacity: Animated.Value;
	toggleChrome: () => void;
}

export function useReaderChrome({ autoHideChrome, showSettings, resetTrigger }: UseReaderChromeOptions): UseReaderChromeResult {
	const [chromeVisible, setChromeVisible] = useState(false);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const chromeOpacity = useRef(new Animated.Value(0)).current;

	const toggleChrome = useCallback(() => {
		if (showSettings) return;
		setChromeVisible((v) => !v);
	}, [showSettings]);

	// Auto-hide timer
	useEffect(() => {
		if (!autoHideChrome || !chromeVisible || showSettings) return;
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => setChromeVisible(false), 3000);
		return () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, [autoHideChrome, chromeVisible, showSettings, resetTrigger]);

	// Animate chrome opacity
	useEffect(() => {
		Animated.timing(chromeOpacity, {
			toValue: chromeVisible ? 1 : 0,
			duration: 200,
			useNativeDriver: true,
		}).start();
	}, [chromeVisible, chromeOpacity]);

	return { chromeVisible, setChromeVisible, chromeOpacity, toggleChrome };
}
