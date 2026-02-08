import { Image } from "react-native"

import resolveAssetSource from "expo-asset/build/resolveAssetSource"

export function ensureImageResolveAssetSource() {
	const imageAny = Image as typeof Image & {
		resolveAssetSource?: typeof resolveAssetSource
	}
	if (!imageAny.resolveAssetSource) {
		imageAny.resolveAssetSource = resolveAssetSource
	}
}
