import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIBRARY_VIEW_STATE,
  fetchLibraryPage,
  fetchMangaDetail,
  LibraryPage,
  MangaDetailPage,
} from './index.js';

describe('@app/library', () => {
  it('exports library page building blocks', () => {
    expect(typeof LibraryPage).toBe('function');
    expect(typeof fetchLibraryPage).toBe('function');
    expect(DEFAULT_LIBRARY_VIEW_STATE.layout).toBe('grid');
  });

  it('exports manga detail building blocks', () => {
    expect(typeof MangaDetailPage).toBe('function');
    expect(typeof fetchMangaDetail).toBe('function');
  });
});
