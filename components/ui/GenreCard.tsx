import { Text, View } from 'react-native';

interface GenreCardProps {
	label: string;
	backgroundColor: string;
	width: number;
}

export function GenreCard({ label, backgroundColor, width }: GenreCardProps) {
	return (
		<View style={{ backgroundColor, width }} className="rounded-control h-22 overflow-hidden px-4 py-3">
			<View className="bg-foreground/15 rounded-bl-control absolute top-0 right-0 h-8 w-10 items-center justify-center">
				<Text className="text-preset-2 font-body" style={{ color: backgroundColor }}>
					→
				</Text>
			</View>
			<View className="flex-1 justify-end pr-9">
				<Text className="text-preset-1 font-heading text-foreground font-semibold" numberOfLines={2}>
					{label}
				</Text>
			</View>
		</View>
	);
}
