import { Text, View } from "react-native"

interface SectionHeadingProps {
	title: string
	subtitle?: string
}

export function SectionHeading({ title, subtitle }: SectionHeadingProps) {
	return (
		<View className="mb-4">
			<Text className="text-xs uppercase tracking-[0.4em] text-neutral-400">
				{title}
			</Text>
			{subtitle ? (
				<Text className="mt-2 text-3xl font-semibold text-[#f5f2eb]">
					{subtitle}
				</Text>
			) : null}
		</View>
	)
}
