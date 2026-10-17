/**
 * Ordering policy for progress snapshots, shared by the persist guards and the
 * snapshot-conflict merge.
 *
 * A newer event always wins. When two events share a millisecond the furthest
 * progress wins (page index, then read percent, then completed), because a
 * stale debounced checkpoint must never roll progress back and a millisecond
 * timestamp cannot order sub-millisecond user input. See the ledger ruling on
 * equal-timestamp progress events.
 */
export interface ProgressOrderingRecord {
  readonly timestamp: string;
  readonly pageIndex: number;
  readonly readPercent: number;
  readonly completed: boolean;
}

/** True when `incoming` should replace `existing` under the ordering policy. */
export function progressOrderingWins(
  incoming: ProgressOrderingRecord,
  existing: ProgressOrderingRecord,
): boolean {
  if (incoming.timestamp !== existing.timestamp) {
    return incoming.timestamp > existing.timestamp;
  }
  if (incoming.pageIndex !== existing.pageIndex) {
    return incoming.pageIndex > existing.pageIndex;
  }
  if (incoming.readPercent !== existing.readPercent) {
    return incoming.readPercent > existing.readPercent;
  }
  return incoming.completed && !existing.completed;
}

/**
 * Library resume metadata ("continue reading") only carries a timestamp and a
 * percent, so the same rule reduces to: newer event wins, ties keep the higher
 * percent.
 */
export function libraryResumeWins(
  incoming: { readonly timestamp: string; readonly readPercent: number },
  existing: {
    readonly timestamp: string | null | undefined;
    readonly readPercent: number | null | undefined;
  },
): boolean {
  if (existing.timestamp === null || existing.timestamp === undefined || existing.timestamp === '') {
    return true;
  }
  if (incoming.timestamp !== existing.timestamp) {
    return incoming.timestamp > existing.timestamp;
  }
  return incoming.readPercent > (existing.readPercent ?? -1);
}

/**
 * A library entry exists from the moment it is added, but its resume fields are
 * only meaningful after the first progress write. `lastReadChapterId` is that
 * sentinel: without it the wall-clock `updatedAt` of other library mutations
 * must not reject a progress event.
 *
 * shortcut: `library_entries.updated_at` doubles as the resume event timestamp,
 * so a later library mutation (favorite, status) also moves it. A progress event
 * created before that mutation is then dropped for this one write; the next
 * event carries a later timestamp and wins. Upgrade to a dedicated
 * `resume_updated_at` column if the library ever needs mutation- and
 * progress-ordering to be independent.
 */
export function hasLibraryResume(existing: {
  readonly lastReadChapterId: string | null | undefined;
}): boolean {
  return (
    existing.lastReadChapterId !== null &&
    existing.lastReadChapterId !== undefined &&
    existing.lastReadChapterId !== ''
  );
}
