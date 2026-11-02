import { useLayoutEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isFocusable(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  if (element.closest('[inert]') !== null) return false;
  const style = window.getComputedStyle(element);
  // `display`/`visibility` rather than layout boxes: this hook also runs where
  // layout is not computed (jsdom), and a hidden node is still "not tabbable".
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export interface FocusTrapOptions {
  /** Focus the first tabbable element when the trap activates (default true). */
  readonly initialFocus?: boolean;
}

/**
 * Keyboard boundary for a hand-rolled modal such as the command palette. Base UI
 * dialogs bring their own trap; this covers the overlays that do not, so Tab and
 * Shift+Tab cycle inside the panel instead of walking into the page behind it,
 * and closing returns focus to whatever opened it.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  { initialFocus = true }: FocusTrapOptions = {},
): void {
  // Distinguishes "this trap closed" from "this trap re-activated within a
  // frame": a stale restore must not steal focus from a fresh activation.
  const pendingRestore = useRef<{ run: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (container === null) return;

    const previous = pendingRestore.current;
    if (previous !== null) previous.run = false;
    const restoreToken = { run: true };
    pendingRestore.current = restoreToken;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isFocusable);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      const target = document.activeElement;

      if (items.length === 0) {
        // Nothing to move to: keep focus on the container rather than the page.
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey) {
        if (target === first || !container.contains(target)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (target === last || !container.contains(target)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    if (initialFocus && !container.contains(document.activeElement)) {
      focusables()[0]?.focus({ preventScroll: true });
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // The panel may still be animating out when the trap deactivates; wait a
      // frame so the restore lands after that commit, and skip it entirely if
      // the trap was re-activated in the meantime.
      requestAnimationFrame(() => {
        if (!restoreToken.run) return;
        if (previouslyFocused?.isConnected === true) {
          previouslyFocused.focus({ preventScroll: true });
        }
      });
    };
  }, [active, containerRef, initialFocus]);
}
