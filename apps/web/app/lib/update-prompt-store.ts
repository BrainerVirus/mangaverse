import type { DesktopPlatformBridge, PlatformUpdateInfo } from '@app/platform';

/**
 * The packaged app's update offer (#215). Main only sends this event for a release it has
 * already downloaded, so "Restart and install" is actionable the moment it appears; the
 * install itself still waits for that click, and main withholds the event entirely while a
 * chapter is open. The title bar's update popover opens on it (update-popover-store), so there is
 * no effect or duplicate subscription in React.
 */
export interface UpdatePromptSnapshot {
  readonly version: string;
}

let snapshot: UpdatePromptSnapshot | null = null;
let subscribed = false;
let unsubscribeBridge: (() => void) | null = null;
const listeners = new Set<() => void>();

function bridge(): DesktopPlatformBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { mangaversePlatform?: DesktopPlatformBridge }).mangaversePlatform;
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function start(): void {
  if (subscribed) return;
  const desktop = bridge();
  if (desktop === undefined || typeof desktop.onUpdateAvailable !== 'function') return;
  subscribed = true;
  unsubscribeBridge = desktop.onUpdateAvailable((info: PlatformUpdateInfo) => {
    snapshot = { version: info.version };
    notify();
  });
}

export function subscribeUpdatePrompt(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeBridge !== null) {
      unsubscribeBridge();
      unsubscribeBridge = null;
      subscribed = false;
    }
  };
}

export function getUpdatePromptSnapshot(): UpdatePromptSnapshot | null {
  return snapshot;
}

/** "Later": close the prompt and tell main not to offer this version again this session. */
export function dismissUpdatePrompt(): void {
  snapshot = null;
  notify();
  void bridge()?.updateDismiss();
}

/** Ask main to restart into the already-downloaded release; main defers until reading ends. */
export function installUpdatePrompt(): void {
  snapshot = null;
  notify();
  void bridge()?.updateInstall();
}
