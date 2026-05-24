import { describe, expect, it } from 'vitest';
import {
  estimateGridRowHeight,
  estimateRowHeight,
  getColumnCount,
  getLibraryRowCount,
  getRowGap,
} from './library-layout-metrics.js';

describe('library layout metrics', () => {
  it('matches responsive grid column counts', () => {
    expect(getColumnCount('grid', 320)).toBe(2);
    expect(getColumnCount('grid', 700)).toBe(3);
    expect(getColumnCount('grid', 900)).toBe(4);
    expect(getColumnCount('grid', 1100)).toBe(5);
    expect(getColumnCount('grid', 1400)).toBe(6);
  });

  it('matches responsive compact column counts', () => {
    expect(getColumnCount('compact', 320)).toBe(1);
    expect(getColumnCount('compact', 700)).toBe(2);
    expect(getColumnCount('compact', 1200)).toBe(3);
  });

  it('uses a single column for list layout', () => {
    expect(getColumnCount('list', 1400)).toBe(1);
  });

  it('derives row counts from item and column counts', () => {
    expect(getLibraryRowCount(10, 3)).toBe(4);
    expect(getLibraryRowCount(9, 3)).toBe(3);
    expect(getLibraryRowCount(0, 3)).toBe(0);
  });

  it('estimates grid row height from card aspect ratio', () => {
    const gap = getRowGap('grid');
    const height = estimateGridRowHeight(1200, 6, gap);
    const itemWidth = (1200 - gap * 5) / 6;

    expect(height).toBe(Math.ceil(itemWidth * (4 / 3)));
  });

  it('returns stable row height estimates per layout', () => {
    expect(estimateRowHeight('list', 800, 1, getRowGap('list'))).toBe(96);
    expect(estimateRowHeight('compact', 800, 2, getRowGap('compact'))).toBe(72);
  });
});
