import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';
import { useIsClient } from '../hooks/use-is-client.js';

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
    let changeCallback: ((event: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = vi.fn<() => MediaQueryList>().mockReturnValue(
      makeMediaQueryList({
        matches: false,
        addEventListener: vi.fn<
          (event: string, handler: EventListenerOrEventListenerObject) => void
        >((_event, handler) => {
          changeCallback = handler as (event: MediaQueryListEvent) => void;
        }),
        removeEventListener:
          vi.fn<(event: string, handler: EventListenerOrEventListenerObject) => void>(),
      }),
    );

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await act(async () => {
      changeCallback?.({ matches: true } as MediaQueryListEvent);
    });

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
