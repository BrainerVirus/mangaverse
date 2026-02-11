import { Text, View } from "react-native"

interface SectionHeadingProps {
	title: string
	subtitle?: string
}

export function SectionHeading({ title, subtitle }: SectionHeadingProps) {
	return (
		<View className="mb-6">
			<View className="flex-row items-center gap-3">
				<View className="h-[2px] w-7 rounded-full bg-accent/80" />
				<Text className="text-[11px] uppercase tracking-[0.34em] text-muted">
					{title}
				</Text>
			</View>
			{subtitle ? (
				<Text className="mt-2 text-3xl font-semibold text-foreground">
					{subtitle}
				</Text>
			) : null}
		</View>
	)
}
