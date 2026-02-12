import { getDiscoverLayout } from "@lib/layout"

describe("getDiscoverLayout", () => {
	test("uses three columns on small widths", () => {
		const layout = getDiscoverLayout(375)
		expect(layout.columns).toBe(3)
		expect(layout.cardWidth).toBeGreaterThan(0)
	})

	test("expands columns on large widths", () => {
		const layout = getDiscoverLayout(1024)
		expect(layout.columns).toBeGreaterThanOrEqual(4)
	})

	test("never exceeds available width", () => {
		const layout = getDiscoverLayout(820)
		const totalWidth =
			layout.cardWidth * layout.columns + layout.gap * (layout.columns - 1) + layout.pagePadding * 2
		expect(totalWidth).toBeLessThanOrEqual(820)
	})
})
