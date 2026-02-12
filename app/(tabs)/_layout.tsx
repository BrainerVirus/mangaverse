import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs"

export default function TabLayout() {
	return (
		<NativeTabs backgroundColor="#0b0b0d" disableTransparentOnScrollEdge>
			<NativeTabs.Trigger name="library">
				<Label>Library</Label>
				<Icon sf="books.vertical" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="discover">
				<Label>Discover</Label>
				<Icon sf="safari" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="history">
				<Label>History</Label>
				<Icon sf="clock" />
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<Label>Home</Label>
				<Icon sf="gear" />
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
