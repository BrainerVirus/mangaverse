// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useReaderFullscreen } from './use-reader-fullscreen.js';

function Harness({ enabled, reducedMotion }: { enabled: boolean; reducedMotion: boolean }) {
  useReaderFullscreen(enabled, reducedMotion);
  return null;
}

function mount(enabled: boolean, reducedMotion = false): { root: Root; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness enabled={enabled} reducedMotion={reducedMotion} />);
  });
  return { root, container };
}

function unmount({ root, container }: { root: Root; container: HTMLElement }) {
  act(() => root.unmount());
  container.remove();
}

describe('useReaderFullscreen', () => {
  const request = vi.fn<() => Promise<void>>(async () => {});
  const exit = vi.fn<() => Promise<void>>(async () => {});

  beforeEach(() => {
    request.mockClear();
    exit.mockClear();
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
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
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    });
    unmount(mounted);
    await act(async () => {});
    expect(exit).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    const off = mount(false);
    expect(exit).toHaveBeenCalledTimes(1);
    unmount(off);
  });

  it('Given the browser refuses, When the request rejects, Then the reader keeps working', async () => {
    request.mockRejectedValueOnce(new Error('denied'));
    const mounted = mount(true);
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });
});
