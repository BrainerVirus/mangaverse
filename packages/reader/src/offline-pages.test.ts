import { describe, expect, it } from 'vitest';

import { formatUnavailableOfflinePages } from './offline-pages.js';

const PAGES = [0, 1, 2, 3, 4];

describe('formatUnavailableOfflinePages', () => {
  it('Given a fully cached chapter, When formatting, Then there is nothing to report', () => {
    expect(formatUnavailableOfflinePages(PAGES, PAGES)).toBeNull();
    expect(formatUnavailableOfflinePages(PAGES, [])).not.toBeNull();
  });

  it('Given one uncached page, When formatting, Then it is named in the reader numbering', () => {
    expect(formatUnavailableOfflinePages(PAGES, [0, 1, 3, 4])).toBe(
      'Offline: page 3 is not saved locally.',
    );
  });

  it('Given several uncached pages, When formatting, Then every one is listed in order', () => {
    expect(formatUnavailableOfflinePages(PAGES, [1, 2])).toBe(
      'Offline: pages 1, 4 and 5 are not saved locally.',
    );
  });
});
