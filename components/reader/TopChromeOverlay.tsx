import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Animated, Pressable, Text, View } from 'react-native';

interface TopChromeOverlayProps {
	chromeOpacity: Animated.Value;
	chromeVisible: boolean;
	insets: { top: number };
	readerTitle: string;
	readerSubtitle: string;
	infoMangaId: string;
	providerId: string;
	onClose: () => void;
}

export function TopChromeOverlay({
	chromeOpacity,
	chromeVisible,
	insets,
	readerTitle,
	readerSubtitle,
	infoMangaId,
	providerId,
	onClose,
}: TopChromeOverlayProps) {
	return (
		<Animated.View
			className="absolute top-0 right-0 left-0"
			style={{ opacity: chromeOpacity, zIndex: chromeVisible ? 20 : -1 }}
			pointerEvents={chromeVisible ? 'auto' : 'none'}
		>
			<LinearGradient colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0)']} style={{ paddingTop: insets.top + 8, paddingBottom: 32, paddingHorizontal: 16 }}>
				<View className="flex-row items-center">
					<View className="flex-1 pr-3">
						<Text className="text-preset-2 font-heading font-semibold" style={{ color: '#fff' }} numberOfLines={1}>
							{readerTitle}
						</Text>
						<Text className="text-preset-1 font-body mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>
							{readerSubtitle}
						</Text>
					</View>
					<Pressable
						onPress={onClose}
						className="h-9 w-9 items-center justify-center rounded-full"
						style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
						hitSlop={8}
					>
						<Ionicons name="close" size={20} color="#fff" />
					</Pressable>
				</View>

				{infoMangaId ? (
					<View className="mt-3">
						<Link
							href={{
								pathname: '/manga/[id]',
								params: { id: infoMangaId, provider: providerId },
							}}
							asChild
						>
							<Pressable
								className="h-10 w-10 items-center justify-center rounded-full"
								style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
								hitSlop={8}
							>
								<Ionicons name="information" size={20} color="#fff" />
							</Pressable>
						</Link>
					</View>
				) : null}
			</LinearGradient>
		</Animated.View>
	);
}
