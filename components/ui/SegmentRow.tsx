import { Text, View } from 'react-native';

import { AnimatedSegmentControl } from '@components/ui/AnimatedSegmentControl';

export function SegmentRow({
	label,
	value,
	options,
	onSelect,
}: {
	label: string;
	value: string;
	options: { id: string; label: string }[];
	onSelect: (id: string) => void;
}) {
	return (
		<View className="py-3">
			<Text className="text-preset-2 font-body text-foreground mb-2">{label}</Text>
			<AnimatedSegmentControl options={options} value={value} onSelect={onSelect} />
		</View>
	);
}
