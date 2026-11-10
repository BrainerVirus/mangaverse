import type { DesktopPlatformBridge, PlatformWindowChrome } from '@app/platform';

/**
 * The window chrome for the title bar: which desktop draws the native controls, and whether the
 * window is fullscreen (no controls, no strip). Main owns it; this store holds the latest copy so
 * the strip reads it with `useSyncExternalStore`, with no effect. `null` means "not known yet" and
 * also "no desktop bridge" (the web build), and in both cases no strip is drawn.
 */
let snapshot: PlatformWindowChrome | null = null;
/** Counts every published value, so an answer asked for earlier can tell it is stale. */
let revision = 0;
/** Counts subscription lifecycles, so an answer to a previous one is dropped. */
let generation = 0;
let unsubscribeBridge: (() => void) | null = null;
const listeners = new Set<() => void>();

function bridge(): DesktopPlatformBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { mangaversePlatform?: DesktopPlatformBridge }).mangaversePlatform;
}

function publish(next: PlatformWindowChrome): void {
  revision += 1;
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function start(): void {
  if (unsubscribeBridge !== null) return;
  const desktop = bridge();
  if (desktop === undefined || typeof desktop.onWindowChrome !== 'function') return;
  unsubscribeBridge = desktop.onWindowChrome(publish);
  // A fullscreen change that arrives first, or a later lifecycle, makes this answer stale.
  const askedAt = revision;
  const lifecycle = generation;
  void desktop.windowChromeGet().then(
    (result) => {
      if (result.ok && lifecycle === generation && revision === askedAt) publish(result.value);
    },
    () => undefined,
  );
}

export function subscribeWindowChrome(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeBridge !== null) {
      unsubscribeBridge();
      unsubscribeBridge = null;
      snapshot = null;
      generation += 1;
    }
  };
}

export function getWindowChromeSnapshot(): PlatformWindowChrome | null {
  return snapshot;
}

export function getServerWindowChromeSnapshot(): PlatformWindowChrome | null {
  return null;
}

/**
 * Paints the Windows/Linux overlay controls in the theme's canvas and ink, so they match the
 * strip. Main accepts `#rrggbb` only and ignores the call on macOS; the web build has no bridge.
 */
export function setTitleBarColors(color: string, symbolColor: string): void {
  const desktop = bridge();
  if (typeof desktop?.windowSetTitleBarColors !== 'function') return;
  void desktop.windowSetTitleBarColors(color, symbolColor).catch(() => undefined);
}
