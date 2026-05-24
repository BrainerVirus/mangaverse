import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH_VIEW_STATE,
  fetchSearchPage,
  SearchPage,
  searchQueryKeys,
  VirtualSearchGrid,
} from './index.js';

describe('@app/search', () => {
  it('exports search page building blocks', () => {
    expect(typeof SearchPage).toBe('function');
    expect(typeof VirtualSearchGrid).toBe('function');
    expect(typeof fetchSearchPage).toBe('function');
    expect(DEFAULT_SEARCH_VIEW_STATE.query).toBe('');
    expect(searchQueryKeys.page({ query: 'test' })).toEqual(['search', 'page', { query: 'test' }]);
  });
});
