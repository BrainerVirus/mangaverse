import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';
import { useIsClient } from '../hooks/use-is-client.js';
import { setInAppReducedMotionPreference } from '../utils/reduced-motion-preference.js';

describe('useIsClient', () => {
  it('should return true after mount (effect sets to true)', () => {
    const { result } = renderHook(() => useIsClient());
    expect(result.current).toBe(true);
  });
});

describe('useReducedMotion', () => {
  const originalMatchMedia = window.matchMedia;

  function makeMediaQueryList(partial: Partial<MediaQueryList>): MediaQueryList {
    return {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      ...partial,
    } as MediaQueryList;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    setInAppReducedMotionPreference(false);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('should return false when media query does not match', () => {
    window.matchMedia = vi.fn<() => MediaQueryList>().mockReturnValue(
      makeMediaQueryList({
        matches: false,
        addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
        removeEventListener: vi.fn<(event: string, handler: () => void) => void>(),
      }),
    );

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('should return true when media query matches (reduced motion preferred)', () => {
    window.matchMedia = vi.fn<() => MediaQueryList>().mockReturnValue(
      makeMediaQueryList({
        matches: true,
        addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
        removeEventListener: vi.fn<(event: string, handler: () => void) => void>(),
      }),
    );

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('should update when media query changes', async () => {
    // The real MediaQueryList flips `matches` before it announces the change;
    // the hook reads that value, so the fake has to behave the same way.
    let matches = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQuery = {
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      addEventListener: (_event: string, handler: EventListenerOrEventListenerObject) => {
        listeners.add(handler as (event: MediaQueryListEvent) => void);
      },
      removeEventListener: (_event: string, handler: EventListenerOrEventListenerObject) => {
        listeners.delete(handler as (event: MediaQueryListEvent) => void);
      },
      get matches() {
        return matches;
      },
    } as unknown as MediaQueryList;
    window.matchMedia = vi.fn<() => MediaQueryList>().mockReturnValue(mediaQuery);

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await act(async () => {
      matches = true;
      for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });

  it('keeps reduced motion active when the app preference is Reduced and the OS allows motion', () => {
    window.matchMedia = vi.fn<() => MediaQueryList>().mockReturnValue(
      makeMediaQueryList({
        matches: false,
        addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
        removeEventListener: vi.fn<(event: string, handler: () => void) => void>(),
      }),
    );

    const { result } = renderHook(() => useReducedMotion());
    act(() => setInAppReducedMotionPreference(true));

    expect(result.current).toBe(true);
  });

  it('should clean up event listener on unmount', () => {
    const removeEventListener = vi.fn<(event: string, handler: () => void) => void>();
    window.matchMedia = vi.fn<() => MediaQueryList>().mockReturnValue(
      makeMediaQueryList({
        matches: false,
        addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
        removeEventListener,
      }),
    );

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
