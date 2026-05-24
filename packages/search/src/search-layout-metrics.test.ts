import { describe, expect, it } from 'vitest';
import {
  estimateSearchRowHeight,
  getSearchColumnCount,
  getSearchRowCount,
} from './search-layout-metrics.js';

describe('search layout metrics', () => {
  it('derives responsive column counts for search grids', () => {
    expect(getSearchColumnCount(400)).toBe(2);
    expect(getSearchColumnCount(700)).toBe(3);
    expect(getSearchColumnCount(900)).toBe(4);
    expect(getSearchColumnCount(1100)).toBe(5);
    expect(getSearchColumnCount(1400)).toBe(6);
  });

  it('computes row counts from item totals', () => {
    expect(getSearchRowCount(0, 3)).toBe(0);
    expect(getSearchRowCount(5, 3)).toBe(2);
    expect(getSearchRowCount(6, 3)).toBe(2);
    expect(getSearchRowCount(7, 3)).toBe(3);
  });

  it('estimates row height from container width', () => {
    const height = estimateSearchRowHeight(1200, 6, 16);
    expect(height).toBeGreaterThan(0);
  });
});
