import { describe, expect, it } from 'vitest';
import { DEFAULT_LIBRARY_VIEW_STATE, fetchLibraryPage, LibraryPage } from './index.js';

describe('@app/library', () => {
  it('exports library page building blocks', () => {
    expect(typeof LibraryPage).toBe('function');
    expect(typeof fetchLibraryPage).toBe('function');
    expect(DEFAULT_LIBRARY_VIEW_STATE.layout).toBe('grid');
  });
});
