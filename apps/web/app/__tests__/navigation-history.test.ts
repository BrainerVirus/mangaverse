import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { goBackIfMarked, readerSessionState } from '../lib/navigation-history.js';

describe('reader history', () => {
  it('returns to the opener after replacing chapters without growing the stack', () => {
    const history = createMemoryHistory({ initialEntries: ['/library', '/manga/a'] });
    history.push('/reader/one', readerSessionState);
    history.replace('/reader/two', history.location.state);
    expect(goBackIfMarked(history, 'reader')).toBe(true);
    expect(history.location.pathname).toBe('/manga/a');
    expect(history.location.state.__TSR_index).toBe(1);
    history.back();
    expect(history.location.pathname).toBe('/library');
    expect(history.length).toBe(3);
  });

  it('does not go back from an unmarked deep link even with earlier history', () => {
    const history = createMemoryHistory({ initialEntries: ['/search', '/reader/one'] });
    expect(goBackIfMarked(history, 'reader')).toBe(false);
    expect(history.location.pathname).toBe('/reader/one');
  });

  it('does not go back from a marked entry at the beginning of history', () => {
    const history = createMemoryHistory({ initialEntries: ['/reader/one'] });
    history.replace('/reader/one', readerSessionState);
    expect(goBackIfMarked(history, 'reader')).toBe(false);
  });

  it('returns to a known Discover feed but not for an unrelated marker', () => {
    const history = createMemoryHistory({ initialEntries: ['/discover?provider=a'] });
    history.push('/discover?provider=a&section=popular', { navigationOpener: 'discover-feed' });
    expect(goBackIfMarked(history, 'extensions')).toBe(false);
    expect(goBackIfMarked(history, 'discover-feed')).toBe(true);
    expect(history.location.href).toBe('/discover?provider=a');
  });
});
