import { render } from "@testing-library/react-native"

import HomeScreen from "@app/index"

describe("<HomeScreen />", () => {
	test("Text renders correctly on HomeScreen", () => {
		const { getByText } = render(<HomeScreen />)

		getByText("Open up App.tsx to start working on your app!")
	})
})
