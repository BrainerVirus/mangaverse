import { oklchToHex } from "@lib/themes/vars"

describe("theme vars", () => {
	test("converts oklch to hex", () => {
		expect(oklchToHex("oklch(0.13 0.01 270)")).toMatch(/^#[0-9a-f]{6}$/i)
		expect(oklchToHex("oklch(0.98 0 0)")).toMatch(/^#[0-9a-f]{6}$/i)
	})

	test("returns null for invalid oklch", () => {
		expect(oklchToHex("oklch(bad)")).toBeNull()
		expect(oklchToHex("not-a-color")).toBeNull()
	})
})
