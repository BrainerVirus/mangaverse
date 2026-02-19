import { useEffect, useRef } from "react"
import { Animated, Easing, View } from "react-native"

interface HeroParallaxImageProps {
	imageUri: string
	height: number
	overflow?: number
}

export function HeroParallaxImage({ imageUri, height, overflow = 20 }: HeroParallaxImageProps) {
	const translateX = useRef(new Animated.Value(0)).current
	const translateY = useRef(new Animated.Value(0)).current

	useEffect(() => {
		const sharedConfig = {
			duration: 8000,
			easing: Easing.inOut(Easing.ease),
			useNativeDriver: true,
		}
		const animation = Animated.loop(
			Animated.sequence([
				Animated.parallel([
					Animated.timing(translateX, { toValue: overflow, ...sharedConfig }),
					Animated.timing(translateY, { toValue: overflow, ...sharedConfig }),
				]),
				Animated.parallel([
					Animated.timing(translateX, { toValue: 0, ...sharedConfig }),
					Animated.timing(translateY, { toValue: 0, ...sharedConfig }),
				]),
			])
		)
		animation.start()
		return () => {
			translateX.stopAnimation()
			translateY.stopAnimation()
			animation.stop()
		}
	}, [overflow, translateX, translateY])

	return (
		<View className="absolute inset-0 overflow-hidden">
			<Animated.Image
				source={{ uri: imageUri }}
				resizeMode="cover"
				style={{
					position: "absolute",
					top: -overflow,
					left: -overflow,
					right: -overflow,
					bottom: -overflow,
					height: height + overflow * 2,
					transform: [{ translateX }, { translateY }],
				}}
			/>
		</View>
	)
}
