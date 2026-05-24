const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

const GRID_GAP = 16;

export function getSearchColumnCount(width: number): number {
  if (width >= BREAKPOINTS.xl) {
    return 6;
  }
  if (width >= BREAKPOINTS.lg) {
    return 5;
  }
  if (width >= BREAKPOINTS.md) {
    return 4;
  }
  if (width >= BREAKPOINTS.sm) {
    return 3;
  }
  return 2;
}

export function getSearchRowGap(): number {
  return GRID_GAP;
}

export function estimateSearchRowHeight(
  containerWidth: number,
  columnCount: number,
  gap: number,
): number {
  if (containerWidth <= 0 || columnCount <= 0) {
    return 280;
  }

  const itemWidth = (containerWidth - gap * (columnCount - 1)) / columnCount;
  return Math.ceil(itemWidth * (4 / 3));
}

export function getSearchRowCount(itemCount: number, columnCount: number): number {
  if (itemCount <= 0 || columnCount <= 0) {
    return 0;
  }

  return Math.ceil(itemCount / columnCount);
}
