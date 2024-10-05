import {
	createMaterialTopTabNavigator,
	MaterialTopTabNavigationEventMap,
	MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs"
import { ParamListBase, TabNavigationState } from "@react-navigation/native"
import { withLayoutContext } from "expo-router"

const { Navigator } = createMaterialTopTabNavigator()

export const MaterialTopTabs = withLayoutContext<
	MaterialTopTabNavigationOptions,
	typeof Navigator,
	TabNavigationState<ParamListBase>,
	MaterialTopTabNavigationEventMap
>(Navigator)

export default function TabLayout() {
	return (
		<MaterialTopTabs
			screenOptions={{
				tabBarScrollEnabled: true,
				tabBarLabelStyle: { fontWeight: "bold", textTransform: "capitalize" },
				tabBarIndicatorStyle: { backgroundColor: "#ff9900", height: 2 },
			}}
		>
			<MaterialTopTabs.Screen name="index" options={{ title: "TuMangaOnline" }} />
		</MaterialTopTabs>
	)
}
