import type { DesktopPlatformBridge, PlatformUpdateInfo } from '@app/platform';

/**
 * The packaged app's update offer (#215). Main sends one event per downloaded release; this
 * small external store lets the prompt component read it with `useSyncExternalStore`, so
 * there is no effect or duplicate subscription in React.
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

export function getServerUpdatePromptSnapshot(): UpdatePromptSnapshot | null {
  return null;
}

/** "Later": close the prompt and tell main not to offer this version again this session. */
export function dismissUpdatePrompt(): void {
  snapshot = null;
  notify();
  void bridge()?.updateDismiss();
}

/** Ask main to restart into the downloaded release; main refuses while a chapter is open. */
export function installUpdatePrompt(): void {
  snapshot = null;
  notify();
  void bridge()?.updateInstall();
}
