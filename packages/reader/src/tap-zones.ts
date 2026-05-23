import type {
  ReaderSessionInput,
  ReaderOverlayInsets,
  TapZoneRegion,
  TapZoneAction,
  TapZoneDebugModel,
  ZoomStateSummary,
} from './types';

function getNavigationMapping(input: ReaderSessionInput): { leftAction: TapZoneAction; rightAction: TapZoneAction } {
  const { readingMode, navigationDirection } = input.settings;

  if (readingMode === 'vertical') {
    return { leftAction: { type: 'none' }, rightAction: { type: 'none' } };
  }

  const isInverted = navigationDirection === 'inverted';
  const isRtl = readingMode === 'rtl';

  const baseLeft: TapZoneAction = { type: 'prevPage' };
  const baseRight: TapZoneAction = { type: 'nextPage' };

  if (isRtl && !isInverted) {
    return { leftAction: { type: 'nextPage' }, rightAction: { type: 'prevPage' } };
  }
  if (isInverted && !isRtl) {
    return { leftAction: { type: 'nextPage' }, rightAction: { type: 'prevPage' } };
  }
  if (isRtl && isInverted) {
    return { leftAction: { type: 'prevPage' }, rightAction: { type: 'nextPage' } };
  }
  return { leftAction: baseLeft, rightAction: baseRight };
}

function buildLeftRightZones(
  input: ReaderSessionInput,
  insets: ReaderOverlayInsets,
  zoomState: ZoomStateSummary | undefined
): TapZoneRegion[] {
  const { leftAction, rightAction } = getNavigationMapping(input);
  const { width, height } = input.viewport;

  if (zoomState && zoomState.scale > 1) {
    return [
      { id: 'left', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'right', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
    ];
  }

  const leftWidth = Math.floor(width / 3) - insets.left;
  const rightWidth = Math.floor(width / 3) - insets.right;
  const top = insets.top;
  const bottom = height - insets.bottom;
  const availableHeight = bottom - top;

  return [
    {
      id: 'left',
      x: insets.left,
      y: top,
      width: Math.max(0, leftWidth),
      height: availableHeight,
      action: leftAction,
    },
    {
      id: 'right',
      x: width - rightWidth - insets.right,
      y: top,
      width: Math.max(0, rightWidth),
      height: availableHeight,
      action: rightAction,
    },
  ];
}

function buildGridZones(
  input: ReaderSessionInput,
  insets: ReaderOverlayInsets,
  zoomState: ZoomStateSummary | undefined
): TapZoneRegion[] {
  const { leftAction, rightAction } = getNavigationMapping(input);
  const { width, height } = input.viewport;

  if (zoomState && zoomState.scale > 1) {
    return [
      { id: 'top-left', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'top-center', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'top-right', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'middle-left', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'center', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'middle-right', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'bottom-left', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'bottom-center', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'bottom-right', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
    ];
  }

  const cellWidth = Math.floor((width - insets.left - insets.right) / 3);
  const cellHeight = Math.floor((height - insets.top - insets.bottom) / 3);

  const centerX = insets.left + cellWidth;
  const centerY = insets.top + cellHeight;

  return [
    {
      id: 'top-left',
      x: insets.left,
      y: insets.top,
      width: cellWidth,
      height: cellHeight,
      action: leftAction,
    },
    {
      id: 'top-center',
      x: centerX,
      y: insets.top,
      width: cellWidth,
      height: cellHeight,
      action: { type: 'none' },
    },
    {
      id: 'top-right',
      x: width - cellWidth - insets.right,
      y: insets.top,
      width: cellWidth,
      height: cellHeight,
      action: rightAction,
    },
    {
      id: 'middle-left',
      x: insets.left,
      y: centerY,
      width: cellWidth,
      height: cellHeight,
      action: leftAction,
    },
    {
      id: 'center',
      x: centerX,
      y: centerY,
      width: cellWidth,
      height: cellHeight,
      action: { type: 'toggleChrome' },
    },
    {
      id: 'middle-right',
      x: width - cellWidth - insets.right,
      y: centerY,
      width: cellWidth,
      height: cellHeight,
      action: rightAction,
    },
    {
      id: 'bottom-left',
      x: insets.left,
      y: height - cellHeight - insets.bottom,
      width: cellWidth,
      height: cellHeight,
      action: leftAction,
    },
    {
      id: 'bottom-center',
      x: centerX,
      y: height - cellHeight - insets.bottom,
      width: cellWidth,
      height: cellHeight,
      action: { type: 'none' },
    },
    {
      id: 'bottom-right',
      x: width - cellWidth - insets.right,
      y: height - cellHeight - insets.bottom,
      width: cellWidth,
      height: cellHeight,
      action: rightAction,
    },
  ];
}

function buildLShapedZones(
  input: ReaderSessionInput,
  insets: ReaderOverlayInsets,
  zoomState: ZoomStateSummary | undefined
): TapZoneRegion[] {
  const { leftAction, rightAction } = getNavigationMapping(input);
  const { width, height } = input.viewport;

  if (zoomState && zoomState.scale > 1) {
    return [
      { id: 'top-left', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'top-right', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'bottom-left', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
      { id: 'bottom-right', x: 0, y: 0, width: 0, height: 0, action: { type: 'none' } },
    ];
  }

  const halfWidth = Math.floor((width - insets.left - insets.right) / 2);
  const halfHeight = Math.floor((height - insets.top - insets.bottom) / 2);

  return [
    {
      id: 'top-left',
      x: insets.left,
      y: insets.top,
      width: halfWidth,
      height: halfHeight,
      action: leftAction,
    },
    {
      id: 'top-right',
      x: insets.left + halfWidth,
      y: insets.top,
      width: halfWidth,
      height: halfHeight,
      action: rightAction,
    },
    {
      id: 'bottom-left',
      x: insets.left,
      y: insets.top + halfHeight,
      width: halfWidth,
      height: halfHeight,
      action: leftAction,
    },
    {
      id: 'bottom-right',
      x: insets.left + halfWidth,
      y: insets.top + halfHeight,
      width: halfWidth,
      height: halfHeight,
      action: rightAction,
    },
  ];
}

export function calculateTapZones(
  input: ReaderSessionInput,
  insets: ReaderOverlayInsets,
  zoomState?: ZoomStateSummary
): TapZoneRegion[] {
  const { tapZoneLayout } = input.settings;

  switch (tapZoneLayout) {
    case 'grid':
      return buildGridZones(input, insets, zoomState);
    case 'lShaped':
      return buildLShapedZones(input, insets, zoomState);
    case 'leftRight':
    default:
      return buildLeftRightZones(input, insets, zoomState);
  }
}

export function resolveTapZoneAction(
  input: ReaderSessionInput,
  params: { zoneId: string; pageIndex: number }
): TapZoneAction {
  const { zoneId } = params;

  if (zoneId === 'center') {
    return { type: 'toggleChrome' };
  }

  const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
  const zone = zones.find(z => z.id === zoneId);

  return zone?.action ?? { type: 'none' };
}

export function createTapZoneDebugModel(
  input: ReaderSessionInput,
  zones: TapZoneRegion[],
  zoomState?: ZoomStateSummary,
  overlayInsets?: ReaderOverlayInsets
): TapZoneDebugModel {
  return {
    regions: zones,
    viewport: input.viewport,
    overlayInsets: overlayInsets ?? { top: 0, right: 0, bottom: 0, left: 0 },
    readingMode: input.settings.readingMode,
    zoomState: zoomState ?? {
      scale: 1,
      translateX: 0,
      translateY: 0,
      minZoom: input.settings.minZoom,
      maxZoom: input.settings.maxZoom,
    },
  };
}