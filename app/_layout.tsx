import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Stack } from "expo-router/stack"
import { GestureHandlerRootView } from "react-native-gesture-handler"

export default function Layout() {
	const queryClient = new QueryClient()
	return (
		<GestureHandlerRootView>
			<QueryClientProvider client={queryClient}>
				<Stack>
					<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
				</Stack>
			</QueryClientProvider>
		</GestureHandlerRootView>
	)
}
