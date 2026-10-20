import { useSyncExternalStore } from 'react';

const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const mediaQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_TRANSPARENCY_QUERY) : null;
  mediaQuery?.addEventListener('change', onChange);

  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(onChange);
  observer?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-glass', 'data-transparency'],
  });

  return () => {
    mediaQuery?.removeEventListener('change', onChange);
    observer?.disconnect();
  };
}

function readProfileFallback(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  const root = document.documentElement;
  const reducedTransparency =
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_TRANSPARENCY_QUERY).matches;
  return (
    root.dataset.glass !== 'full' || root.dataset.transparency === 'solid' || reducedTransparency
  );
}

function readServerProfileFallback(): boolean {
  // Start with no effects until the client knows its profile and transparency preference.
  return true;
}

export function useGlassProfileFallback(): boolean {
  return useSyncExternalStore(subscribe, readProfileFallback, readServerProfileFallback);
}
