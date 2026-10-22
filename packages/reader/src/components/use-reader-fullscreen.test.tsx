// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useReaderFullscreen } from './use-reader-fullscreen.js';

function Harness({ openOnEnter, reducedMotion }: { openOnEnter: boolean; reducedMotion: boolean }) {
  const { toggleFullscreen } = useReaderFullscreen({ openOnEnter, reducedMotion });
  return (
    <button type="button" onClick={toggleFullscreen}>
      Toggle fullscreen
    </button>
  );
}

function mount(
  openOnEnter: boolean,
  reducedMotion = false,
): { root: Root; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness openOnEnter={openOnEnter} reducedMotion={reducedMotion} />);
  });
  return { root, container };
}

function unmount({ root, container }: { root: Root; container: HTMLElement }) {
  act(() => root.unmount());
  container.remove();
}

function clickToggle(container: HTMLElement) {
  const button = container.querySelector('button');
  if (button === null) throw new Error('toggle did not render');
  act(() => button.click());
}

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useReaderFullscreen', () => {
  const request = vi.fn<() => Promise<void>>(async () => {});
  const exit = vi.fn<() => Promise<void>>(async () => {});

  beforeEach(() => {
    request.mockClear();
    exit.mockClear();
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    setFullscreenElement(null);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: request,
    });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  });

  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    Reflect.deleteProperty(document, 'exitFullscreen');
  });

  it('Given fullscreen-on-open, When the reader mounts, Then it requests fullscreen once', async () => {
    const mounted = mount(true);
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given the setting is off, When the reader mounts, Then fullscreen is left to the manual button', async () => {
    const mounted = mount(false);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    unmount(mounted);
  });

  it('Given reduced motion, When the reader mounts, Then the automatic takeover is skipped', async () => {
    const mounted = mount(true, true);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    unmount(mounted);
  });

  it('Given an owned fullscreen, When the reader unmounts, Then it exits only its own fullscreen', async () => {
    const mounted = mount(true);
    await act(async () => {});
    setFullscreenElement(document.documentElement);
    unmount(mounted);
    await act(async () => {});
    expect(exit).toHaveBeenCalledTimes(1);

    setFullscreenElement(null);
    const off = mount(false);
    expect(exit).toHaveBeenCalledTimes(1);
    unmount(off);
  });

  it('Given the manual toggle, When the reader closes, Then the fullscreen it opened is exited', async () => {
    const mounted = mount(false);
    await act(async () => {});
    clickToggle(mounted.container);
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);

    setFullscreenElement(document.documentElement);
    unmount(mounted);
    await act(async () => {});
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('Given a fullscreen the reader did not open, When the reader closes, Then it leaves it alone', async () => {
    const mounted = mount(false);
    await act(async () => {});
    setFullscreenElement(document.documentElement);

    unmount(mounted);
    await act(async () => {});
    expect(exit).not.toHaveBeenCalled();
  });

  it('Given a manual request still in flight on close, Then the late fullscreen is exited', async () => {
    const pending = deferred<void>();
    request.mockImplementationOnce(() => pending.promise);
    const mounted = mount(false);
    clickToggle(mounted.container);
    expect(request).toHaveBeenCalledTimes(1);

    unmount(mounted);
    setFullscreenElement(document.documentElement);
    await act(async () => {
      pending.resolve();
    });

    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('Given the browser refuses, When the request rejects, Then the reader keeps working', async () => {
    request.mockRejectedValueOnce(new Error('denied'));
    const mounted = mount(true);
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });
});
