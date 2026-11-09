import type { DesktopPlatformBridge, PlatformUpdateState } from '@app/platform';

/**
 * The update state for the whole app: the title-bar button, its progress window and the settings
 * section all read this one value. Main owns the state; this store holds the latest copy so the
 * components can read it with `useSyncExternalStore`, with no effect and no duplicate subscription.
 * `null` means "not known yet" (before the first answer) and also "no desktop bridge" (the web build).
 */
let snapshot: PlatformUpdateState | null = null;
let subscribed = false;
let unsubscribeBridge: (() => void) | null = null;
const listeners = new Set<() => void>();

function bridge(): DesktopPlatformBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { mangaversePlatform?: DesktopPlatformBridge }).mangaversePlatform;
}

function publish(next: PlatformUpdateState): void {
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function start(): void {
  if (subscribed) return;
  const desktop = bridge();
  if (desktop === undefined || typeof desktop.onUpdateState !== 'function') return;
  subscribed = true;
  unsubscribeBridge = desktop.onUpdateState(publish);
  // A window that opens after the last change asks for the current state. An event that
  // arrives first is newer than this answer, so it wins.
  void desktop.updateGetState().then((result) => {
    if (result.ok && snapshot === null) publish(result.value);
  });
}

export function subscribeUpdateState(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeBridge !== null) {
      unsubscribeBridge();
      unsubscribeBridge = null;
      subscribed = false;
      snapshot = null;
    }
  };
}

export function getUpdateStateSnapshot(): PlatformUpdateState | null {
  return snapshot;
}

export function getServerUpdateStateSnapshot(): PlatformUpdateState | null {
  return null;
}

/** "Check for updates": main starts the check and answers with the state it began in. */
export async function checkForUpdatesNow(): Promise<void> {
  const result = await bridge()?.updateCheckNow();
  if (result?.ok === true) publish(result.value);
}
