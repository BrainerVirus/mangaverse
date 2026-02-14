import { Text, View } from "react-native"

interface SectionHeadingProps {
	title: string
	subtitle?: string
}

export function SectionHeading({ title, subtitle }: SectionHeadingProps) {
	return (
		<View className="mb-6">
			<View className="flex-row items-center gap-3">
				<View className="bg-accent/80 h-0.5 w-7 rounded-full" />
				<Text className="text-muted text-[11px] tracking-[0.34em] uppercase">{title}</Text>
			</View>
			{subtitle ? (
				<Text className="text-foreground mt-2 text-3xl font-semibold">{subtitle}</Text>
			) : null}
		</View>
	)
}
