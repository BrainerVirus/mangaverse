import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { SegmentRow } from '@components/ui/SegmentRow';
import { ToggleRow } from '@components/ui/ToggleRow';
import { useThemeColors } from '@lib/themes/vars';
import { useSettingsStore } from '@stores/settings';

const readerModes = [
	{ id: 'webtoon', label: 'Vertical' },
	{ id: 'paged', label: 'Horizontal' },
];

const directions = [
	{ id: 'rtl', label: 'RTL (Manga)' },
	{ id: 'ltr', label: 'LTR (Comic)' },
];

const tapPresets = [
	{ id: 'balanced', label: 'Balanced' },
	{ id: 'wide-center', label: 'Wide' },
	{ id: 'classic', label: 'Classic' },
];

const fitModes = [
	{ id: 'contain', label: 'Fit screen' },
	{ id: 'width', label: 'Fit width' },
	{ id: 'cover', label: 'Fill' },
];

const backgrounds = [
	{ id: 'theme', label: 'Theme' },
	{ id: 'black', label: 'Black' },
	{ id: 'white', label: 'White' },
];

export default function ReaderSettings() {
	const readerMode = useSettingsStore((state) => state.readerMode);
	const setReaderMode = useSettingsStore((state) => state.setReaderMode);
	const readerDirection = useSettingsStore((state) => state.readerDirection);
	const setReaderDirection = useSettingsStore((state) => state.setReaderDirection);
	const tapZonePreset = useSettingsStore((state) => state.tapZonePreset);
	const setTapZonePreset = useSettingsStore((state) => state.setTapZonePreset);
	const swipeEnabled = useSettingsStore((state) => state.swipeEnabled);
	const setSwipeEnabled = useSettingsStore((state) => state.setSwipeEnabled);
	const tapNavigationEnabled = useSettingsStore((state) => state.tapNavigationEnabled);
	const setTapNavigationEnabled = useSettingsStore((state) => state.setTapNavigationEnabled);
	const autoHideChrome = useSettingsStore((state) => state.autoHideChrome);
	const setAutoHideChrome = useSettingsStore((state) => state.setAutoHideChrome);
	const fitMode = useSettingsStore((state) => state.fitMode);
	const setFitMode = useSettingsStore((state) => state.setFitMode);
	const chapterBackground = useSettingsStore((state) => state.chapterBackground);
	const setChapterBackground = useSettingsStore((state) => state.setChapterBackground);
	const lockRotation = useSettingsStore((state) => state.lockRotation);
	const setLockRotation = useSettingsStore((state) => state.setLockRotation);
	const themeColors = useThemeColors();
	const trackColors = useMemo(() => ({ false: themeColors.border, true: themeColors.primary }), [themeColors.border, themeColors.primary]);

	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Reader" subtitle="Defaults & gestures" />
				<View className="gap-3 pb-12">
					<View className="border-border/30 bg-card/70 rounded-box border p-5">
						<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Reader mode</Text>
						<SegmentRow label="Reader type" value={readerMode} options={readerModes} onSelect={(id) => setReaderMode(id as 'webtoon' | 'paged')} />
						<SegmentRow
							label="Reading direction"
							value={readerDirection}
							options={directions}
							onSelect={(id) => setReaderDirection(id as 'rtl' | 'ltr')}
						/>
						<SegmentRow
							label="Tap zones"
							value={tapZonePreset}
							options={tapPresets}
							onSelect={(id) => setTapZonePreset(id as 'balanced' | 'wide-center' | 'classic')}
						/>
					</View>
					<View className="border-border/30 bg-card/70 rounded-box border p-5">
						<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Display</Text>
						<SegmentRow label="Page fit" value={fitMode} options={fitModes} onSelect={(id) => setFitMode(id as 'contain' | 'width' | 'cover')} />
						<SegmentRow
							label="Chapter background"
							value={chapterBackground}
							options={backgrounds}
							onSelect={(id) => setChapterBackground(id as 'theme' | 'black' | 'white')}
						/>
					</View>
					<View className="border-border/30 bg-card/70 rounded-box border p-5">
						<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Controls</Text>
						<View className="mt-3">
							<ToggleRow label="Swipe navigation" value={swipeEnabled} onToggle={setSwipeEnabled} trackColors={trackColors} />
							<ToggleRow label="Tap navigation" value={tapNavigationEnabled} onToggle={setTapNavigationEnabled} trackColors={trackColors} />
							<ToggleRow label="Auto-hide UI" value={autoHideChrome} onToggle={setAutoHideChrome} trackColors={trackColors} />
							<ToggleRow label="Lock rotation" value={lockRotation} onToggle={setLockRotation} trackColors={trackColors} />
						</View>
					</View>
				</View>
			</ScrollView>
		</View>
	);
}
