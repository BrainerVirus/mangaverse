import type { RefObject } from 'react';
import { useGSAP } from '@gsap/react';

export interface GsapContextOptions {
  /**
   * Revert the context's animations (and their inline styles) before every re-run. On by default;
   * turn it off for a component whose animations carry on across updates, such as a control that
   * morphs from one state to the next. The context still reverts on unmount.
   */
  readonly revertOnUpdate?: boolean;
}

export function useGsapContext(
  scope: RefObject<HTMLElement | null>,
  callback: (ctx: gsap.Context) => void | (() => void),
  deps?: unknown[],
  { revertOnUpdate = true }: GsapContextOptions = {},
): void {
  useGSAP(callback, {
    scope: scope as { current: HTMLElement | null },
    dependencies: deps ?? [],
    revertOnUpdate,
  });
}
