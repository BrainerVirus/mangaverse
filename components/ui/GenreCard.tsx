import { Text, View } from 'react-native';

interface GenreCardProps {
	label: string;
	backgroundColor: string;
	width: number;
}

export function GenreCard({ label, backgroundColor, width }: GenreCardProps) {
	return (
		<View style={{ backgroundColor, width }} className="h-22 overflow-hidden rounded-[18px] px-4 py-3">
			<View className="absolute top-0 right-0 h-8 w-10 items-center justify-center rounded-bl-2xl bg-foreground/15">
				<Text className="text-preset-2 font-body" style={{ color: backgroundColor }}>
					→
				</Text>
			</View>
			<View className="flex-1 justify-end pr-9">
				<Text className="text-preset-1 font-heading font-semibold text-foreground" numberOfLines={2}>
					{label}
				</Text>
			</View>
		</View>
	);
}
