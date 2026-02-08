import { render } from "@testing-library/react-native"

import HomeScreen from "@app/index"
import { Redirect } from "expo-router"

jest.mock("expo-router", () => ({
	Redirect: jest.fn(() => null),
}))

describe("<HomeScreen />", () => {
	test("Redirects to discover", () => {
		render(<HomeScreen />)

		expect(Redirect).toHaveBeenCalledWith(expect.objectContaining({ href: "/discover" }))
	})
})
