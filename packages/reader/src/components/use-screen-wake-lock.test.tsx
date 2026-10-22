// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useScreenWakeLock } from './use-screen-wake-lock.js';

interface MockSentinel {
  released: number;
  release: () => Promise<void>;
}

function Harness({ enabled }: { enabled: boolean }) {
  useScreenWakeLock(enabled);
  return null;
}

function mount(enabled: boolean): { root: Root; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness enabled={enabled} />);
  });
  return { root, container };
}

function unmount({ root, container }: { root: Root; container: HTMLElement }) {
  act(() => root.unmount());
  container.remove();
}

describe('useScreenWakeLock', () => {
  const sentinels: MockSentinel[] = [];
  const request = vi.fn<() => Promise<MockSentinel>>(async () => {
    const sentinel: MockSentinel = {
      released: 0,
      release: async () => {
        sentinel.released += 1;
      },
    };
    sentinels.push(sentinel);
    return sentinel;
  });

  beforeEach(() => {
    sentinels.length = 0;
    request.mockClear();
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'wakeLock');
  });

  it('Given keep-awake is on, When the reader mounts, Then it requests a screen lock once', async () => {
    const mounted = mount(true);
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given a hidden tab, When visibility changes, Then the lock is released and reacquired on return', async () => {
    const mounted = mount(true);
    await act(async () => {});

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {});
    expect(sentinels[0]?.released).toBe(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(2);
    unmount(mounted);
  });

  it('Given keep-awake is off or the API is missing, When mounted, Then nothing is requested and nothing throws', async () => {
    const off = mount(false);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    unmount(off);

    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'wakeLock');
    const unsupported = mount(true);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    unmount(unsupported);
  });

  it('Given unmounting, When a lock is held, Then it is released', async () => {
    const mounted = mount(true);
    await act(async () => {});
    unmount(mounted);
    await act(async () => {});
    expect(sentinels[0]?.released).toBe(1);
  });
});
