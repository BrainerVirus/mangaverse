/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopPlatformBridge, PlatformUpdateInfo } from '@app/platform';

async function freshStore() {
  vi.resetModules();
  return import('../update-popover-store.js');
}

afterEach(() => {
  delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
});

describe('update popover store', () => {
  it('Given no desktop bridge (the web build), Then it starts closed and the server snapshot is closed', async () => {
    const store = await freshStore();
    const unsubscribe = store.subscribeUpdatePopover(() => {});
    expect(store.getUpdatePopoverOpenSnapshot()).toBe(false);
    expect(store.getServerUpdatePopoverOpenSnapshot()).toBe(false);
    unsubscribe();
  });

  it('Given a subscriber, When it is opened and closed, Then it is told once per change', async () => {
    const store = await freshStore();
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribeUpdatePopover(listener);
    store.setUpdatePopoverOpen(true);
    store.setUpdatePopoverOpen(true);
    expect(store.getUpdatePopoverOpenSnapshot()).toBe(true);
    store.setUpdatePopoverOpen(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('Given it was left open, When the last subscriber leaves, Then it is closed for the next one', async () => {
    const store = await freshStore();
    const unsubscribe = store.subscribeUpdatePopover(() => {});
    store.setUpdatePopoverOpen(true);
    unsubscribe();
    expect(store.getUpdatePopoverOpenSnapshot()).toBe(false);
  });

  it('Given main already offered a version, When a title bar subscribes after, Then it opens once for it', async () => {
    let offer: (info: PlatformUpdateInfo) => void = () => {};
    (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform = {
      onUpdateAvailable: (listener: (info: PlatformUpdateInfo) => void) => {
        offer = listener;
        return () => {};
      },
    } as unknown as DesktopPlatformBridge;
    const store = await freshStore();

    const first = store.subscribeUpdatePopover(() => {});
    offer({ version: '1.1.0' });
    expect(store.getUpdatePopoverOpenSnapshot()).toBe(true);
    first();

    // The prompt store still holds the offer, but this version already opened the popover.
    const second = store.subscribeUpdatePopover(() => {});
    expect(store.getUpdatePopoverOpenSnapshot()).toBe(false);
    second();
  });
});
