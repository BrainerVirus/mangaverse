import { useQuery } from "@tanstack/react-query"
import { fetchPopularManga } from "lib/sources/tumangaonline"
import { FlatList, Image, Text, View } from "react-native"

export default function MangaDex() {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["popular"],
		queryFn: fetchPopularManga,
	})
	return (
		<View className="bg-white">
			<Text className="mb-8 text-base font-normal text-black">Lorem ipsum.</Text>
			<View>
				{isLoading ? (
					<Text>Loading...</Text>
				) : isError ? (
					<Text>Error</Text>
				) : (
					<FlatList
						data={data}
						numColumns={3}
						renderItem={({ item }) => (
							<View style={{ flex: 1, margin: 5 }}>
								<Image
									source={{
										uri: item.cover,
									}}
									className="h-[147] w-[107] rounded-lg"
								></Image>
								<Text className="truncate" numberOfLines={2}>
									{item.title}
								</Text>
							</View>
						)}
					/>
				)}
			</View>
		</View>
	)
}
