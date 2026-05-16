import type { RefObject } from 'react';
import { useGSAP } from '@gsap/react';

export function useGsapContext(
  scope: RefObject<HTMLElement>,
  callback: (ctx: gsap.Context) => void,
  deps?: unknown[]
): void {
  useGSAP(callback, { scope: scope as { current: HTMLElement | null }, dependencies: deps ?? [] });
}