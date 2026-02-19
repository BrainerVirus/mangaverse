import { Text, View } from 'react-native';

interface GenreCardProps {
	label: string;
	backgroundColor: string;
	width: number;
}

export function GenreCard({ label, backgroundColor, width }: GenreCardProps) {
	return (
		<View style={{ backgroundColor, width }} className="h-20 overflow-hidden rounded-[18px] px-4 py-3">
			<View className="absolute top-3 right-3 h-7 w-7 items-center justify-center rounded-full bg-overlay/35">
				<Text className="text-preset-1 font-body text-foreground">↗</Text>
			</View>
			<Text className="text-preset-1 font-heading pr-10 font-semibold text-foreground" numberOfLines={2}>
				{label}
			</Text>
		</View>
	);
}
