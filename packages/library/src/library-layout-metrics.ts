import type { LibraryLayoutMode } from '@app/shared';

const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export function getColumnCount(layout: LibraryLayoutMode, width: number): number {
  if (layout === 'list') {
    return 1;
  }

  if (layout === 'compact') {
    if (width >= BREAKPOINTS.lg) {
      return 3;
    }
    if (width >= BREAKPOINTS.sm) {
      return 2;
    }
    return 1;
  }

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

export function getRowGap(layout: LibraryLayoutMode): number {
  switch (layout) {
    case 'grid':
      return 16;
    case 'list':
      return 12;
    case 'compact':
      return 8;
  }
}

export function estimateGridRowHeight(
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

export function estimateListRowHeight(): number {
  return 96;
}

export function estimateCompactRowHeight(): number {
  return 72;
}

export function estimateRowHeight(
  layout: LibraryLayoutMode,
  containerWidth: number,
  columnCount: number,
  gap: number,
): number {
  switch (layout) {
    case 'grid':
      return estimateGridRowHeight(containerWidth, columnCount, gap);
    case 'list':
      return estimateListRowHeight();
    case 'compact':
      return estimateCompactRowHeight();
  }
}

export function getLibraryRowCount(itemCount: number, columnCount: number): number {
  if (itemCount <= 0 || columnCount <= 0) {
    return 0;
  }

  return Math.ceil(itemCount / columnCount);
}
