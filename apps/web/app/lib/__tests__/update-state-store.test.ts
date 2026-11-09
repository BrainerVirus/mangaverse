/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@app/shared';
import type { DesktopPlatformBridge, PlatformUpdateState } from '@app/platform';

const idle: PlatformUpdateState = {
  enabled: true,
  currentVersion: '1.0.0',
  lastCheckedAt: null,
  phase: { kind: 'idle' },
};
const downloading: PlatformUpdateState = {
  ...idle,
  phase: { kind: 'downloading', version: '1.1.0', percent: 40, transferred: 400, total: 1000 },
};

function installBridge(initial: Promise<PlatformUpdateState> = Promise.resolve(idle)) {
  let emit: (state: PlatformUpdateState) => void = () => {};
  const unsubscribe = vi.fn<() => void>();
  const bridge = {
    updateGetState: vi.fn<() => Promise<unknown>>(async () => ok(await initial)),
    updateCheckNow: vi.fn<() => Promise<unknown>>(async () =>
      ok({ ...idle, phase: { kind: 'checking' } }),
    ),
    onUpdateState: vi.fn<(listener: (state: PlatformUpdateState) => void) => () => void>(
      (listener) => {
        emit = listener;
        return unsubscribe;
      },
    ),
  };
  (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform =
    bridge as unknown as DesktopPlatformBridge;
  return { bridge, unsubscribe, emit: (state: PlatformUpdateState) => emit(state) };
}

async function freshStore() {
  vi.resetModules();
  return import('../update-state-store.js');
}

describe('update state store', () => {
  beforeEach(() => {
    delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
  });
  afterEach(() => {
    delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
  });

  it('Given no desktop bridge (the web build), Then the state stays unknown and subscribing is harmless', async () => {
    const store = await freshStore();
    const unsubscribe = store.subscribeUpdateState(() => {});
    expect(store.getUpdateStateSnapshot()).toBeNull();
    expect(store.getServerUpdateStateSnapshot()).toBeNull();
    unsubscribe();
  });

  it('Given a subscriber, When the window opens, Then it receives the current state from main', async () => {
    const { bridge } = installBridge();
    const store = await freshStore();
    const listener = vi.fn<() => void>();
    store.subscribeUpdateState(listener);
    await vi.waitFor(() => expect(store.getUpdateStateSnapshot()).toEqual(idle));
    expect(listener).toHaveBeenCalled();
    expect(bridge.updateGetState).toHaveBeenCalledTimes(1);
  });

  it('Given state events, Then every subscriber sees the latest one', async () => {
    const { emit } = installBridge();
    const store = await freshStore();
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    store.subscribeUpdateState(first);
    store.subscribeUpdateState(second);
    emit(downloading);
    expect(store.getUpdateStateSnapshot()).toEqual(downloading);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('Given an event arrives before the initial answer, Then the older answer does not overwrite it', async () => {
    let release: (state: PlatformUpdateState) => void = () => {};
    const { emit } = installBridge(new Promise((resolve) => (release = resolve)));
    const store = await freshStore();
    store.subscribeUpdateState(() => {});
    emit(downloading);
    release(idle);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getUpdateStateSnapshot()).toEqual(downloading);
  });

  it('Given only one bridge subscription for many subscribers, When the last one leaves, Then it unsubscribes and forgets', async () => {
    const { bridge, unsubscribe, emit } = installBridge();
    const store = await freshStore();
    const a = store.subscribeUpdateState(() => {});
    const b = store.subscribeUpdateState(() => {});
    expect(bridge.onUpdateState).toHaveBeenCalledTimes(1);
    emit(downloading);
    a();
    expect(unsubscribe).not.toHaveBeenCalled();
    b();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(store.getUpdateStateSnapshot()).toBeNull();
  });

  it('Given check now, Then main is asked and the state it began in is shown at once', async () => {
    const { bridge } = installBridge();
    const store = await freshStore();
    store.subscribeUpdateState(() => {});
    await vi.waitFor(() => expect(store.getUpdateStateSnapshot()).toEqual(idle));
    await store.checkForUpdatesNow();
    expect(bridge.updateCheckNow).toHaveBeenCalledTimes(1);
    expect(store.getUpdateStateSnapshot()?.phase).toEqual({ kind: 'checking' });
  });

  it('Given a state event arrives while check now is answering, Then the older reply does not overwrite it', async () => {
    const { bridge, emit } = installBridge();
    const store = await freshStore();
    store.subscribeUpdateState(() => {});
    await vi.waitFor(() => expect(store.getUpdateStateSnapshot()).toEqual(idle));
    let reply: (value: unknown) => void = () => {};
    bridge.updateCheckNow.mockImplementationOnce(() => new Promise((resolve) => (reply = resolve)));
    const pending = store.checkForUpdatesNow();
    emit(downloading);
    reply(ok({ ...idle, phase: { kind: 'checking' } }));
    await pending;
    expect(store.getUpdateStateSnapshot()).toEqual(downloading);
  });

  it('Given the last subscriber leaves and another arrives, Then the old initial answer is dropped', async () => {
    let releaseFirst: (state: PlatformUpdateState) => void = () => {};
    const { bridge } = installBridge();
    bridge.updateGetState
      .mockImplementationOnce(async () =>
        ok(await new Promise<PlatformUpdateState>((r) => (releaseFirst = r))),
      )
      .mockImplementationOnce(async () => ok(downloading));
    const store = await freshStore();
    store.subscribeUpdateState(() => {})();
    store.subscribeUpdateState(() => {});
    await vi.waitFor(() => expect(store.getUpdateStateSnapshot()).toEqual(downloading));
    releaseFirst(idle);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getUpdateStateSnapshot()).toEqual(downloading);
  });

  it('Given no bridge, When check now is called, Then it does nothing', async () => {
    const store = await freshStore();
    await expect(store.checkForUpdatesNow()).resolves.toBeUndefined();
    expect(store.getUpdateStateSnapshot()).toBeNull();
  });
});
