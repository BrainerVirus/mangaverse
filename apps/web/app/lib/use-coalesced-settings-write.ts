import { useCallback, useRef } from 'react';

export const SETTINGS_WRITE_DELAY_MS = 300;

/**
 * Writers with a timer still waiting. A new edit on any surface flushes the
 * others first: submission order then matches edit order even when a surface
 * unmounted before its timer fired (for example, the reader quick panel then
 * the reader-settings page).
 */
const pendingWriters = new Map<object, () => void>();

function flushOtherPendingWriters(self: object): void {
  for (const [key, flush] of [...pendingWriters]) {
    if (key !== self) flush();
  }
}

function forgetPendingWriter(self: object): void {
  pendingWriters.delete(self);
}

export interface CoalescedSettingsWriter<T> {
  /** Queues the latest value; a 300 ms quiet window writes it once. */
  schedule(value: T): void;
  /** Commits the pending value immediately (pointer-up, blur). */
  flush(): void;
  cancel(): void;
}

/**
 * A writer whose pending edits are kept apart by scope. A reset of one scope
 * must not cancel an unrelated edit in the other: the reader quick panel edits
 * "this title" and "all titles" through the same surface.
 */
export interface ScopedCoalescedSettingsWriter<K extends string, T> {
  /** Queues the latest value for one scope; a 300 ms quiet window writes it once. */
  schedule(scope: K, value: T): void;
  /** Commits one scope, or every pending scope when omitted, immediately. */
  flush(scope?: K): void;
  /** Drops one scope's queued value, or every scope when omitted. */
  cancel(scope?: K): void;
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
  const writerId = useRef<object>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: T } | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    pending.current = null;
    forgetPendingWriter(writerId.current);
    if (next !== null) write(next.value);
  }, [write]);

  const schedule = useCallback(
    (value: T) => {
      flushOtherPendingWriters(writerId.current);
      pending.current = { value };
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(flush, delayMs);
      pendingWriters.set(writerId.current, flush);
    },
    [delayMs, flush],
  );

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    forgetPendingWriter(writerId.current);
  }, []);
  return { schedule, flush, cancel };
}

/**
 * Scope-aware variant of {@link useCoalescedSettingsWrite}. Pending values and
 * timers are per scope, so cancelling a title reset leaves a queued global edit
 * alone (and the reverse). Writes for different scopes stay independent; the
 * caller's mutation scope decides how they serialize.
 */
export function useScopedCoalescedSettingsWrite<K extends string, T>(
  write: (scope: K, value: T) => void,
  delayMs = SETTINGS_WRITE_DELAY_MS,
): ScopedCoalescedSettingsWriter<K, T> {
  const writerId = useRef<object>({});
  const timers = useRef(new Map<K, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<K, T>());

  const flushOne = useCallback(
    (scope: K) => {
      const timer = timers.current.get(scope);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.current.delete(scope);
      }
      const hasValue = pending.current.has(scope);
      const value = pending.current.get(scope);
      pending.current.delete(scope);
      if (pending.current.size === 0 && timers.current.size === 0) {
        forgetPendingWriter(writerId.current);
      }
      if (hasValue) write(scope, value as T);
    },
    [write],
  );

  const flush = useCallback(
    (scope?: K) => {
      if (scope !== undefined) {
        flushOne(scope);
        return;
      }
      // Snapshot the keys: a write may schedule another scope, and that edit
      // belongs to its own quiet window, not this flush.
      for (const key of [...pending.current.keys(), ...timers.current.keys()]) {
        flushOne(key);
      }
    },
    [flushOne],
  );

  const schedule = useCallback(
    (scope: K, value: T) => {
      flushOtherPendingWriters(writerId.current);
      pending.current.set(scope, value);
      const existing = timers.current.get(scope);
      if (existing !== undefined) clearTimeout(existing);
      const timer = setTimeout(() => flushOne(scope), delayMs);
      timers.current.set(scope, timer);
      pendingWriters.set(writerId.current, flush);
    },
    [delayMs, flush, flushOne],
  );

  const cancel = useCallback((scope?: K) => {
    if (scope !== undefined) {
      const timer = timers.current.get(scope);
      if (timer !== undefined) clearTimeout(timer);
      timers.current.delete(scope);
      pending.current.delete(scope);
      if (pending.current.size === 0 && timers.current.size === 0) {
        forgetPendingWriter(writerId.current);
      }
      return;
    }
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    pending.current.clear();
    forgetPendingWriter(writerId.current);
  }, []);

  return { schedule, flush, cancel };
}
