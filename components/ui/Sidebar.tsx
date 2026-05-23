import { usePathname, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Ionicons } from '@components/icons';
import { useThemeColors } from '@lib/themes/vars';

const navItems = [
	{ path: '/discover', label: 'Discover', icon: 'compass' as const },
	{ path: '/search', label: 'Search', icon: 'search' as const },
	{ path: '/library', label: 'Library', icon: 'bookmarks' as const },
	{ path: '/history', label: 'History', icon: 'time' as const },
	{ path: '/settings', label: 'Settings', icon: 'settings' as const },
];

export default function Sidebar({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: (v: boolean) => void }) {
	const router = useRouter();
	const pathname = usePathname();
	const theme = useThemeColors();
	const [hovered, setHovered] = useState(false);

	const isExpanded = !collapsed || hovered;

	const handleNavigate = useCallback(
		(path: string) => {
			router.push(path);
		},
		[router],
	);

	const isActive = useCallback(
		(path: string) => {
			return pathname.startsWith(path);
		},
		[pathname],
	);

	return (
		<View
			className="border-border bg-background h-full flex-shrink-0 border-r transition-all duration-200"
			style={{ width: isExpanded ? 240 : 64 }}
			onPointerEnter={() => {
				if (collapsed) setHovered(true);
			}}
			onPointerLeave={() => {
				if (collapsed) setHovered(false);
			}}
		>
			<View className="flex-1 py-4">
				{navItems.map((item) => {
					const active = isActive(item.path);
					return (
						<Pressable
							key={item.path}
							onPress={() => handleNavigate(item.path)}
							className={`rounded-control mx-2 flex-row items-center px-3 py-2.5 transition-colors ${active ? 'bg-primary/15' : 'hover:bg-muted/50'}`}
						>
							<Ionicons
								name={active ? item.icon : (`${item.icon}-outline` as never)}
								size={22}
								color={active ? theme.primary : theme.mutedForeground}
							/>
							{isExpanded && (
								<Text className={`text-preset-2 ml-3 ${active ? 'text-primary font-semibold' : 'text-muted-foreground'}`} numberOfLines={1}>
									{item.label}
								</Text>
							)}
						</Pressable>
					);
				})}
			</View>
			<Pressable onPress={() => onCollapse(!collapsed)} className="rounded-control hover:bg-muted/50 mx-2 mb-4 flex-row items-center px-3 py-2.5">
				<Ionicons name={collapsed ? 'chevron-forward' : 'chevron-back'} size={20} color={theme.mutedForeground} />
				{isExpanded && <Text className="text-preset-2 text-muted-foreground ml-3">{collapsed ? 'Expand' : 'Collapse'}</Text>}
			</Pressable>
		</View>
	);
}
