import { Text, View } from 'react-native';

interface SectionHeadingProps {
	title: string;
	subtitle?: string;
}

export function SectionHeading({ title, subtitle }: SectionHeadingProps) {
	return (
		<View className="mb-6">
			<View className="flex-row items-center gap-3">
				<View className="bg-primary/80 rounded-badge h-0.5 w-7" />
				<Text className="text-foreground text-preset-3 font-heading font-semibold">{title}</Text>
			</View>
			{subtitle ? <Text className="text-muted text-preset-1 font-body mt-2">{subtitle}</Text> : null}
		</View>
	);
}
