import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@lib/themes/vars';
import { useHistoryStore } from '@stores/history';
import { usePreferencesStore } from '@stores/preferences';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';
import type { HistoryEntry } from '../../types/library';

function formatTimeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	if (days < 30) return `${Math.floor(days / 7)}w ago`;
	return `${Math.floor(days / 30)}mo ago`;
}

function groupByDay(entries: HistoryEntry[]): { label: string; entries: HistoryEntry[] }[] {
	const groups: Record<string, HistoryEntry[]> = {};
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const yesterday = today - 86400000;

	for (const entry of entries) {
		const entryDate = new Date(entry.readAt);
		const dayStart = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate()).getTime();
		let label: string;
		if (dayStart >= today) {
			label = 'Today';
		} else if (dayStart >= yesterday) {
			label = 'Yesterday';
		} else {
			const diff = today - dayStart;
			const days = Math.floor(diff / 86400000);
			if (days < 7) label = `${days} days ago`;
			else if (days < 30) label = `${Math.floor(days / 7)} weeks ago`;
			else label = 'Over a month ago';
		}
		if (!groups[label]) groups[label] = [];
		groups[label].push(entry);
	}

	const order = ['Today', 'Yesterday'];
	const sortedKeys = Object.keys(groups).sort((a, b) => {
		const ai = order.indexOf(a);
		const bi = order.indexOf(b);
		if (ai !== -1 && bi !== -1) return ai - bi;
		if (ai !== -1) return -1;
		if (bi !== -1) return 1;
		return 0;
	});

	return sortedKeys.map((label) => ({ label, entries: groups[label] }));
}

function HistoryRow({ entry, onRemove }: { entry: HistoryEntry; onRemove: () => void }) {
	const themeColors = useThemeColors();
	return (
		<View className="flex-row items-center px-4 py-3">
			{entry.coverUrl ? (
				<Image source={{ uri: entry.coverUrl }} className="rounded-btn mr-3 h-20 w-14" resizeMode="cover" />
			) : (
				<View className="bg-card rounded-btn mr-3 h-20 w-14 items-center justify-center">
					<Ionicons name="book-outline" size={20} color={themeColors.muted} />
				</View>
			)}
			<View className="flex-1">
				<Text className="text-foreground text-preset-2 font-heading font-semibold" numberOfLines={1}>
					{entry.title}
				</Text>
				<Text className="text-muted text-preset-1 font-body mt-0.5">Chapter {entry.chapter}</Text>
				<View className="mt-2 flex-row items-center justify-between">
					<Text className="text-muted-foreground text-preset-1 font-body">Last Page Read: {entry.page}</Text>
					<Text className="text-muted-foreground text-preset-1 font-body">{formatTimeAgo(entry.readAt)}</Text>
				</View>
			</View>
			<Pressable onPress={onRemove} className="ml-2 p-2" hitSlop={8}>
				<Ionicons name="close" size={16} color={themeColors.muted} />
			</Pressable>
		</View>
	);
}

export default function History() {
	const entries = useHistoryStore((state) => state.entries);
	const removeEntry = useHistoryStore((state) => state.removeEntry);
	const clearHistory = useHistoryStore((state) => state.clear);
	const privateMode = usePreferencesStore((state) => state.privateMode);
	const setPrivateMode = usePreferencesStore((state) => state.setPrivateMode);
	const seedHistory = useHistoryStore((state) => state.seedHistory);
	const tabBarPadding = useTabBarPadding(16);
	const themeColors = useThemeColors();
	const insets = useSafeAreaInsets();
	const headerHeight = 44 + insets.top;

	useEffect(() => {
		seedHistory();
	}, [seedHistory]);

	const grouped = useMemo(() => groupByDay(entries), [entries]);

	const handleClear = () => {
		Alert.alert('Clear History', 'Remove all reading history?', [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Clear', style: 'destructive', onPress: clearHistory },
		]);
	};

	return (
		<View className="bg-background flex-1">
			<ScrollView
				className="flex-1"
				contentContainerStyle={{
					paddingTop: headerHeight + 8,
					paddingBottom: tabBarPadding,
				}}
				contentInsetAdjustmentBehavior="never"
			>
				{privateMode && (
					<View className="border-warning/40 bg-warning/10 rounded-box mx-4 mb-4 border p-4">
						<View className="flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-warning text-preset-2 font-heading font-semibold">Private mode is on</Text>
								<Text className="text-warning text-preset-1 font-body mt-1">History entries will not be saved.</Text>
							</View>
							<Switch
								value={privateMode}
								onValueChange={setPrivateMode}
								trackColor={{ false: themeColors.border, true: themeColors.accent }}
								thumbColor={privateMode ? themeColors.background : themeColors.card}
								ios_backgroundColor={themeColors.border}
							/>
						</View>
					</View>
				)}

				{entries.length === 0 ? (
					<View className="flex-1 items-center justify-center px-8 py-20">
						<Ionicons name="time-outline" size={64} color={themeColors.muted} />
						<Text className="text-foreground text-preset-4 font-heading mt-6 text-center font-semibold">Nothing here yet</Text>
						<Text className="text-muted text-preset-2 font-body mt-2 text-center">Start reading to see your history appear.</Text>
					</View>
				) : (
					grouped.map((group) => (
						<View key={group.label} className="mb-2">
							<Text className="text-foreground text-preset-4 font-heading mb-2 px-4 font-semibold">{group.label}</Text>
							<View className="bg-card/50 mx-4 overflow-hidden rounded-2xl">
								{group.entries.map((entry, index) => (
									<View key={`${entry.id}-${index}`}>
										<HistoryRow entry={entry} onRemove={() => removeEntry(entry.id)} />
										{index < group.entries.length - 1 && <View className="bg-border/30 ml-[76px] h-px" />}
									</View>
								))}
							</View>
						</View>
					))
				)}
			</ScrollView>

			{/* Fixed header */}
			<View className="absolute top-0 right-0 left-0" style={{ zIndex: 10 }}>
				<View className="relative overflow-hidden">
					{Platform.OS === 'ios' ? (
						<BlurView intensity={80} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} />
					) : (
						<View className="bg-background/90" style={StyleSheet.absoluteFillObject} />
					)}
					<View style={{ paddingTop: insets.top, height: headerHeight }} className="flex-row items-center justify-between px-4">
						<Pressable onPress={() => setPrivateMode(!privateMode)} hitSlop={8}>
							<Ionicons name={privateMode ? 'eye-off' : 'eye'} size={24} color={privateMode ? themeColors.warning : themeColors.foreground} />
						</Pressable>
						<Text className="text-foreground text-preset-2 font-heading font-semibold">History</Text>
						{entries.length > 0 ? (
							<Pressable onPress={handleClear} hitSlop={8}>
								<Text className="text-primary text-preset-1 font-heading font-semibold">Clear</Text>
							</Pressable>
						) : (
							<View className="w-10" />
						)}
					</View>
				</View>
			</View>
		</View>
	);
}
