/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@app/shared';
import type { DesktopPlatformBridge, PlatformWindowChrome } from '@app/platform';

const windowed: PlatformWindowChrome = { platform: 'darwin', fullScreen: false, height: 36 };
const fullScreen: PlatformWindowChrome = { ...windowed, fullScreen: true };

function installBridge(initial: Promise<PlatformWindowChrome> = Promise.resolve(windowed)) {
  let emit: (chrome: PlatformWindowChrome) => void = () => {};
  const unsubscribe = vi.fn<() => void>();
  const bridge = {
    windowChromeGet: vi.fn<() => Promise<unknown>>(async () => ok(await initial)),
    windowSetTitleBarColors: vi.fn<(color: string, symbolColor: string) => Promise<unknown>>(
      async () => ok(undefined),
    ),
    onWindowChrome: vi.fn<(listener: (chrome: PlatformWindowChrome) => void) => () => void>(
      (listener) => {
        emit = listener;
        return unsubscribe;
      },
    ),
  };
  (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform =
    bridge as unknown as DesktopPlatformBridge;
  return { bridge, unsubscribe, emit: (chrome: PlatformWindowChrome) => emit(chrome) };
}

async function freshStore() {
  vi.resetModules();
  return import('../window-chrome-store.js');
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('window chrome store', () => {
  beforeEach(() => {
    delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
  });
  afterEach(() => {
    delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
  });

  it('Given no desktop bridge (the web build), Then there is no chrome and nothing is painted', async () => {
    const store = await freshStore();
    const unsubscribe = store.subscribeWindowChrome(() => {});
    expect(store.getWindowChromeSnapshot()).toBeNull();
    expect(store.getServerWindowChromeSnapshot()).toBeNull();
    expect(() => store.setTitleBarColors('#000000', '#ffffff')).not.toThrow();
    unsubscribe();
  });

  it('Given a subscriber, Then it receives the chrome main reports for this window', async () => {
    const { bridge } = installBridge();
    const store = await freshStore();
    const listener = vi.fn<() => void>();
    store.subscribeWindowChrome(listener);
    await settle();
    expect(bridge.windowChromeGet).toHaveBeenCalledTimes(1);
    expect(store.getWindowChromeSnapshot()).toEqual(windowed);
    expect(listener).toHaveBeenCalled();
  });

  it('Given the window goes fullscreen, Then the event replaces the snapshot', async () => {
    const { emit } = installBridge();
    const store = await freshStore();
    store.subscribeWindowChrome(() => {});
    await settle();
    emit(fullScreen);
    expect(store.getWindowChromeSnapshot()).toEqual(fullScreen);
  });

  it('Given an event arrives before the first answer, Then the late answer does not overwrite it', async () => {
    let answer: (chrome: PlatformWindowChrome) => void = () => {};
    const { emit } = installBridge(new Promise((resolve) => (answer = resolve)));
    const store = await freshStore();
    store.subscribeWindowChrome(() => {});
    emit(fullScreen);
    answer(windowed);
    await settle();
    expect(store.getWindowChromeSnapshot()).toEqual(fullScreen);
  });

  it('Given the last subscriber leaves, Then the bridge listener is removed and the next one asks again', async () => {
    const { bridge, unsubscribe } = installBridge();
    const store = await freshStore();
    const stop = store.subscribeWindowChrome(() => {});
    await settle();
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(store.getWindowChromeSnapshot()).toBeNull();
    store.subscribeWindowChrome(() => {});
    await settle();
    expect(bridge.windowChromeGet).toHaveBeenCalledTimes(2);
    expect(store.getWindowChromeSnapshot()).toEqual(windowed);
  });

  it('Given theme colours, Then they reach main unchanged', async () => {
    const { bridge } = installBridge();
    const store = await freshStore();
    store.setTitleBarColors('#09090b', '#fafafa');
    expect(bridge.windowSetTitleBarColors).toHaveBeenCalledWith('#09090b', '#fafafa');
  });
});
