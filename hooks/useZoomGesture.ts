import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export interface ZoomState {
	scale: number;
	translateX: number;
	translateY: number;
}

interface UseZoomGestureOptions {
	containerWidth: number;
	containerHeight: number;
	renderedImageWidth: number;
	renderedImageHeight: number;
	enabled: boolean;
	mode: 'paged' | 'webtoon';
	maxScale?: number;
	onSingleTap?: (x: number, y: number) => void;
	onSwipe?: (direction: 'left' | 'right') => void;
}

function clamp(value: number, min: number, max: number): number {
	'worklet';
	return Math.min(Math.max(value, min), max);
}

function getMaxTranslate(renderedDim: number, containerDim: number, currentScale: number): number {
	'worklet';
	return Math.max(0, (renderedDim * currentScale - containerDim) / 2);
}

export function useZoomGesture({
	containerWidth,
	containerHeight,
	renderedImageWidth,
	renderedImageHeight,
	enabled,
	mode,
	maxScale = 3,
	onSingleTap,
	onSwipe,
}: UseZoomGestureOptions) {
	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);

	const gesture = useMemo(() => {
		const pinchGesture = Gesture.Pinch()
			.enabled(enabled)
			.onStart(() => {
				'worklet';
				savedScale.value = scale.value;
				savedTranslateX.value = translateX.value;
				savedTranslateY.value = translateY.value;
			})
			.onUpdate((e) => {
				'worklet';
				const newScale = clamp(savedScale.value * e.scale, 1, maxScale);
				scale.value = newScale;

				const focalX = e.focalX - containerWidth / 2;
				const focalY = e.focalY - containerHeight / 2;
				const ratio = newScale / savedScale.value;

				const rawTx = focalX * (1 - ratio) + savedTranslateX.value * ratio;
				const rawTy = focalY * (1 - ratio) + savedTranslateY.value * ratio;

				const maxTx = getMaxTranslate(renderedImageWidth, containerWidth, newScale);
				const maxTy = getMaxTranslate(renderedImageHeight, containerHeight, newScale);

				translateX.value = clamp(rawTx, -maxTx, maxTx);
				translateY.value = clamp(rawTy, -maxTy, maxTy);
			})
			.onEnd(() => {
				'worklet';
				if (scale.value < 1.05) {
					scale.value = withTiming(1, { duration: 200 });
					translateX.value = withTiming(0, { duration: 200 });
					translateY.value = withTiming(0, { duration: 200 });
				}
			});

		const doubleTapGesture = Gesture.Tap()
			.numberOfTaps(2)
			.maxDuration(250)
			.enabled(enabled)
			.onEnd(() => {
				'worklet';
				scale.value = withTiming(1, { duration: 250 });
				translateX.value = withTiming(0, { duration: 250 });
				translateY.value = withTiming(0, { duration: 250 });
			});

		const singleTapGesture = Gesture.Tap()
			.numberOfTaps(1)
			.maxDuration(250)
			.onEnd((e) => {
				'worklet';
				if (onSingleTap) {
					runOnJS(onSingleTap)(e.x, e.y);
				}
			});

		let panGesture;
		if (mode === 'paged') {
			panGesture = Gesture.Pan()
				.minPointers(1)
				.maxPointers(1)
				.activeOffsetX([-12, 12])
				.activeOffsetY([-12, 12])
				.enabled(enabled)
				.onStart(() => {
					'worklet';
					savedTranslateX.value = translateX.value;
					savedTranslateY.value = translateY.value;
				})
				.onUpdate((e) => {
					'worklet';
					if (scale.value > 1) {
						const maxTx = getMaxTranslate(renderedImageWidth, containerWidth, scale.value);
						const maxTy = getMaxTranslate(renderedImageHeight, containerHeight, scale.value);
						translateX.value = clamp(savedTranslateX.value + e.translationX, -maxTx, maxTx);
						translateY.value = clamp(savedTranslateY.value + e.translationY, -maxTy, maxTy);
					}
				})
				.onEnd((e) => {
					'worklet';
					if (scale.value <= 1 && onSwipe) {
						const isHorizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
						if (isHorizontal && Math.abs(e.translationX) > 40) {
							const direction: 'left' | 'right' = e.translationX < 0 ? 'left' : 'right';
							runOnJS(onSwipe)(direction);
						}
					}
				});
		} else {
			panGesture = Gesture.Pan()
				.minPointers(1)
				.maxPointers(1)
				.manualActivation(true)
				.onTouchesMove((_e, stateManager) => {
					'worklet';
					if (scale.value > 1) {
						stateManager.activate();
					} else {
						stateManager.fail();
					}
				})
				.onStart(() => {
					'worklet';
					savedTranslateX.value = translateX.value;
					savedTranslateY.value = translateY.value;
				})
				.onUpdate((e) => {
					'worklet';
					const maxTx = getMaxTranslate(renderedImageWidth, containerWidth, scale.value);
					const maxTy = getMaxTranslate(renderedImageHeight, containerHeight, scale.value);
					translateX.value = clamp(savedTranslateX.value + e.translationX, -maxTx, maxTx);
					translateY.value = clamp(savedTranslateY.value + e.translationY, -maxTy, maxTy);
				});
		}

		const taps = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
		return Gesture.Simultaneous(pinchGesture, panGesture, taps);
	}, [
		containerWidth,
		containerHeight,
		renderedImageWidth,
		renderedImageHeight,
		enabled,
		mode,
		maxScale,
		onSingleTap,
		onSwipe,
		scale,
		savedScale,
		translateX,
		translateY,
		savedTranslateX,
		savedTranslateY,
	]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
	}));

	const resetZoom = () => {
		scale.value = withTiming(1, { duration: 200 });
		translateX.value = withTiming(0, { duration: 200 });
		translateY.value = withTiming(0, { duration: 200 });
	};

	const saveState = (): ZoomState => ({
		scale: scale.value,
		translateX: translateX.value,
		translateY: translateY.value,
	});

	const restoreState = (state: ZoomState) => {
		scale.value = state.scale;
		translateX.value = state.translateX;
		translateY.value = state.translateY;
	};

	return { gesture, animatedStyle, scale, resetZoom, saveState, restoreState };
}
