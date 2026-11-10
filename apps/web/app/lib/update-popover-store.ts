import { getUpdatePromptSnapshot, subscribeUpdatePrompt } from './update-prompt-store.js';

/**
 * Whether the title bar's update popover is open. The Update pill opens it on click, and main's
 * "ready, ask now" offer (the update-prompt store, which main sends at most once per version and
 * holds back while a chapter is open) opens it once on its own. A small external store keeps that
 * out of effects and state: the popover reads it with `useSyncExternalStore`.
 *
 * The title bar remounts when the shell and the reader swap layouts, so what it must not lose
 * lives here: the version already offered, so a remount never reopens the panel.
 */
let open = false;
/** The version whose offer already opened the popover. */
let offeredVersion: string | null = null;
let unsubscribePrompt: (() => void) | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function openForOffer(): void {
  const offer = getUpdatePromptSnapshot();
  if (offer === null || offer.version === offeredVersion) return;
  offeredVersion = offer.version;
  open = true;
  notify();
}

export function subscribeUpdatePopover(listener: () => void): () => void {
  if (unsubscribePrompt === null) {
    unsubscribePrompt = subscribeUpdatePrompt(openForOffer);
    // An offer that arrived while no title bar was mounted (a layout swap) is still pending.
    openForOffer();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribePrompt !== null) {
      unsubscribePrompt();
      unsubscribePrompt = null;
      // A panel left open must not come back open when the next title bar mounts.
      open = false;
    }
  };
}

export function getUpdatePopoverOpenSnapshot(): boolean {
  return open;
}

export function getServerUpdatePopoverOpenSnapshot(): boolean {
  return false;
}

export function setUpdatePopoverOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  notify();
}
