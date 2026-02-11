import { Label, NativeTabs } from "expo-router/unstable-native-tabs"

export default function TabLayout() {
	return (
		<NativeTabs
			backgroundColor="#0b0b0d"
			disableTransparentOnScrollEdge
		>
			<NativeTabs.Trigger name="library">
				<Label>Library</Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="discover">
				<Label>Discover</Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="history">
				<Label>History</Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<Label>Settings</Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
