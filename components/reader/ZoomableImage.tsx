import { useEffect, useMemo, useRef } from 'react';
import { Image, type ImageResizeMode, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { useZoomGesture, type ZoomState } from '../../hooks/useZoomGesture';

interface ZoomableImageProps {
	source: { uri: string; headers?: Record<string, string> };
	containerWidth: number;
	containerHeight: number;
	imageAspectRatio: number;
	mode: 'paged' | 'webtoon';
	enabled: boolean;
	pageKey: string;
	zoomStatesRef: React.RefObject<Map<string, ZoomState>>;
	onSingleTap?: (x: number, y: number) => void;
	onSwipe?: (direction: 'left' | 'right') => void;
	resizeMode?: ImageResizeMode;
	onImageLoad?: (event: { nativeEvent: { source?: { width?: number; height?: number } } }) => void;
	style?: ViewStyle;
}

export function ZoomableImage({
	source,
	containerWidth,
	containerHeight,
	imageAspectRatio,
	mode,
	enabled,
	pageKey,
	zoomStatesRef,
	onSingleTap,
	onSwipe,
	resizeMode = 'contain',
	onImageLoad,
	style,
}: ZoomableImageProps) {
	const renderedDimensions = useMemo(() => {
		if (resizeMode === 'cover') {
			return { width: containerWidth, height: containerHeight };
		}
		const containerAspect = containerWidth / containerHeight;
		if (imageAspectRatio > containerAspect) {
			return {
				width: containerWidth,
				height: containerWidth / imageAspectRatio,
			};
		}
		return {
			width: containerHeight * imageAspectRatio,
			height: containerHeight,
		};
	}, [containerWidth, containerHeight, imageAspectRatio, resizeMode]);

	const { gesture, animatedStyle, scale, resetZoom, saveState, restoreState } = useZoomGesture({
		containerWidth,
		containerHeight,
		renderedImageWidth: renderedDimensions.width,
		renderedImageHeight: renderedDimensions.height,
		enabled,
		mode,
		onSingleTap,
		onSwipe,
	});

	const prevPageKeyRef = useRef(pageKey);

	useEffect(() => {
		if (mode !== 'paged') return;

		if (prevPageKeyRef.current !== pageKey) {
			const prev = prevPageKeyRef.current;
			if (zoomStatesRef.current) {
				zoomStatesRef.current.set(prev, saveState());
			}
		}

		if (zoomStatesRef.current) {
			const saved = zoomStatesRef.current.get(pageKey);
			if (saved) {
				restoreState(saved);
			} else {
				resetZoom();
			}
		}

		prevPageKeyRef.current = pageKey;
	}, [pageKey, mode, zoomStatesRef, saveState, restoreState, resetZoom]);

	// Reset zoom when the scale shared value is read as undefined (component mount)
	useEffect(() => {
		if (mode === 'webtoon') {
			scale.value = 1;
		}
	}, [mode, scale]);

	return (
		<GestureDetector gesture={gesture}>
			<Animated.View
				style={[
					{
						width: containerWidth,
						height: containerHeight,
						overflow: 'hidden',
					},
					style,
				]}
			>
				<Animated.View style={[{ width: containerWidth, height: containerHeight }, animatedStyle]}>
					<Image source={source} style={{ width: containerWidth, height: containerHeight }} resizeMode={resizeMode} onLoad={onImageLoad} />
				</Animated.View>
			</Animated.View>
		</GestureDetector>
	);
}
