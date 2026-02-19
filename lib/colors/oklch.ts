const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const toHexChannel = (value: number) => {
	const clamped = clamp(value)
	const rounded = Math.round(clamped * 255)
	return rounded.toString(16).padStart(2, "0")
}

export const parseOklch = (value: string) => {
	const match = /oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*(?:\/\s*([0-9.]+%?))?\s*\)/i.exec(
		value
	)
	if (!match) {
		return null
	}
	const lightness = Number(match[1])
	const chroma = Number(match[2])
	const hue = Number(match[3])
	const alpha = match[4]
	if (
		Number.isNaN(lightness) ||
		Number.isNaN(chroma) ||
		Number.isNaN(hue) ||
		(lightness < 0 || lightness > 1)
	) {
		return null
	}
	return { lightness, chroma, hue, alpha }
}

export const formatOklch = (lightness: number, chroma: number, hue: number, alpha?: string) => {
	const l = clamp(lightness)
	const c = clamp(chroma, 0, 0.4)
	const h = ((hue % 360) + 360) % 360
	return alpha ? `oklch(${l} ${c} ${h} / ${alpha})` : `oklch(${l} ${c} ${h})`
}

export const oklchToHex = (value: string) => {
	const parsed = parseOklch(value)
	if (!parsed) {
		return null
	}
	const { lightness, chroma, hue } = parsed
	const hueRadians = (hue * Math.PI) / 180
	const a = chroma * Math.cos(hueRadians)
	const b = chroma * Math.sin(hueRadians)

	const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
	const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
	const s_ = lightness - 0.0894841775 * a - 1.291485548 * b

	const l = l_ ** 3
	const m = m_ ** 3
	const s = s_ ** 3

	const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
	const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
	const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

	const toSrgb = (channel: number) =>
		channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055

	const red = toSrgb(rLinear)
	const green = toSrgb(gLinear)
	const blue = toSrgb(bLinear)

	return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
}
