import { Switch, Text, View } from 'react-native';

export function ToggleRow({
	label,
	value,
	onToggle,
	trackColors,
}: {
	label: string;
	value: boolean;
	onToggle: (v: boolean) => void;
	trackColors: { false: string; true: string };
}) {
	return (
		<View className="flex-row items-center justify-between py-3">
			<Text className="text-preset-2 font-body text-foreground">{label}</Text>
			<Switch value={value} onValueChange={onToggle} trackColor={trackColors} thumbColor="#fff" />
		</View>
	);
}
