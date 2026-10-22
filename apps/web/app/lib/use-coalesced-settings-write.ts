import { useCallback, useRef } from 'react';

export const SETTINGS_WRITE_DELAY_MS = 300;

export interface CoalescedSettingsWriter<T> {
  /** Queues the latest value; a 300 ms quiet window writes it once. */
  schedule(value: T): void;
  /** Commits the pending value immediately (pointer-up, blur). */
  flush(): void;
  cancel(): void;
}

/**
 * Coalesces a burst of settings edits into one write. The timer intentionally
 * outlives unmount: leaving the page must not drop the last change, and the
 * captured DB handle is still valid. `write` must be stable (a mutation's
 * `mutate` is) so a re-render does not change the pending destination.
 */
export function useCoalescedSettingsWrite<T>(
  write: (value: T) => void,
  delayMs = SETTINGS_WRITE_DELAY_MS,
): CoalescedSettingsWriter<T> {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: T } | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    pending.current = null;
    if (next !== null) write(next.value);
  }, [write]);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);
  return { schedule, flush, cancel };
}
