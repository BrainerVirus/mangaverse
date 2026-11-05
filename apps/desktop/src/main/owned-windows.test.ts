import type { WebFrameMain } from 'electron';
import { describe, expect, it } from 'vitest';
import { createTrustedFrameCheck } from './data-host.js';
import { createOwnedWindows, type OwnableWindow } from './owned-windows.js';

interface FakeWindow extends OwnableWindow {
  close(): void;
}

function fakeFrame(processId: number, routingId: number, url: string) {
  return { processId, routingId, url, parent: null } as unknown as WebFrameMain;
}

function fakeWindow(mainFrame: WebFrameMain): FakeWindow {
  const closed: (() => void)[] = [];
  return {
    webContents: { mainFrame },
    once: (_event, listener) => closed.push(listener),
    close: () => closed.forEach((listener) => listener()),
  };
}

function trusting(owned: ReturnType<typeof createOwnedWindows>) {
  return createTrustedFrameCheck({
    ownedMainFrames: () => owned.mainFrames(),
    allowedOrigins: ['app://app'],
  });
}

describe('owned windows', () => {
  it('trusts the main frame of a window main registered', () => {
    const owned = createOwnedWindows();
    const main = fakeFrame(4, 1, 'app://app/library');
    owned.own(fakeWindow(main));
    expect(trusting(owned)(main)).toBe(true);
  });

  it('does not trust a window nothing registered, such as a popup, even on the app origin', () => {
    const owned = createOwnedWindows();
    owned.own(fakeWindow(fakeFrame(4, 1, 'app://app/library')));
    // A popup is built by Chromium, not by main: it is never passed to `own`.
    const popup = fakeFrame(9, 1, 'app://app/library');
    expect(trusting(owned)(popup)).toBe(false);
  });

  it('stops trusting a window once it closes, and keeps the others', () => {
    const owned = createOwnedWindows();
    const firstFrame = fakeFrame(4, 1, 'app://app/');
    const secondFrame = fakeFrame(5, 1, 'app://app/');
    const first = fakeWindow(firstFrame);
    owned.own(first);
    owned.own(fakeWindow(secondFrame));
    first.close();
    expect(owned.mainFrames()).toEqual([secondFrame]);
    expect(trusting(owned)(firstFrame)).toBe(false);
    expect(trusting(owned)(secondFrame)).toBe(true);
  });

  it('reads the main frame at call time, so a navigation that swaps it stays trusted', () => {
    const owned = createOwnedWindows();
    const webContents = { mainFrame: fakeFrame(4, 1, 'app://app/') };
    owned.own({ webContents, once: () => undefined });
    const swapped = fakeFrame(4, 2, 'app://app/library');
    webContents.mainFrame = swapped;
    expect(owned.mainFrames()).toEqual([swapped]);
    expect(trusting(owned)(swapped)).toBe(true);
  });
});
