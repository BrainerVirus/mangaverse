import type { ZoomStateSummary } from './types';

export interface ZoomSettings {
  minZoom: number;
  maxZoom: number;
  doubleTapZoom: number;
  gestureSensitivity: number;
}

export function createZoomState(settings: ZoomSettings): ZoomStateSummary {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
    minZoom: settings.minZoom,
    maxZoom: settings.maxZoom,
  };
}

export function applyDoubleTapZoom(
  state: ZoomStateSummary,
  tapPosition: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  doubleTapZoom: number
): ZoomStateSummary {
  const targetScale = state.scale === 1 ? doubleTapZoom : 1;
  const scale = targetScale;

  const currentWidth = viewportWidth;
  const currentHeight = viewportHeight;
  const scaledWidth = currentWidth * scale;
  const scaledHeight = currentHeight * scale;

  const centerX = tapPosition.x;
  const centerY = tapPosition.y;

  const originX = (centerX - state.translateX) / state.scale;
  const originY = (centerY - state.translateY) / state.scale;

  const newTranslateX = centerX - originX * scale;
  const newTranslateY = centerY - originY * scale;

  return {
    ...state,
    scale,
    translateX: newTranslateX,
    translateY: newTranslateY,
  };
}

export function applyPinchZoom(
  state: ZoomStateSummary,
  currentScale: number,
  targetScale: number,
  center: { centerX: number; centerY: number }
): ZoomStateSummary {
  const scale = Math.min(Math.max(targetScale, state.minZoom), state.maxZoom);

  const originX = (center.centerX - state.translateX) / state.scale;
  const originY = (center.centerY - state.translateY) / state.scale;

  const newTranslateX = center.centerX - originX * scale;
  const newTranslateY = center.centerY - originY * scale;

  return {
    ...state,
    scale,
    translateX: newTranslateX,
    translateY: newTranslateY,
  };
}

export function applyPan(
  state: ZoomStateSummary,
  deltaX: number,
  deltaY: number
): ZoomStateSummary {
  return {
    ...state,
    translateX: state.translateX + deltaX,
    translateY: state.translateY + deltaY,
  };
}

export function clampZoomTransform(
  state: ZoomStateSummary,
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): ZoomStateSummary {
  if (state.scale <= 1) {
    return { ...state, translateX: 0, translateY: 0 };
  }

  const scaledWidth = pageWidth * state.scale;
  const scaledHeight = pageHeight * state.scale;

  const minTranslateX = Math.min(0, viewportWidth - scaledWidth);
  const maxTranslateX = 0;
  const minTranslateY = Math.min(0, viewportHeight - scaledHeight);
  const maxTranslateY = 0;

  const translateX = Math.max(minTranslateX, Math.min(maxTranslateX, state.translateX));
  const translateY = Math.max(minTranslateY, Math.min(maxTranslateY, state.translateY));

  return {
    ...state,
    translateX,
    translateY,
  };
}