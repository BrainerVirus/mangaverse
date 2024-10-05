import Carousel from "@components/carousel"
import { useQuery } from "@tanstack/react-query"
import { fetchPopularManga } from "lib/sources/tumangaonline"
import * as React from "react"
import { FlatList, Image, Text, View } from "react-native"

export default function TuMangaOnline() {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["popular"],
		queryFn: fetchPopularManga,
	})

	return (
		<View className="bg-gray-100">
			<View>
				<Carousel />
				<Text className="text-lg">Generes</Text>
				<Text className="text-lg">Hot Updates</Text>
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
				<Text className="text-lg">Latests Updates</Text>
				<Text className="text-lg">New Titles</Text>
				<Text className="text-lg">Recomendations</Text>
			</View>
		</View>
	)
}
