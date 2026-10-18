/**
 * Durable byte store contract for snapshot-based browser persistence.
 *
 * Implementations (IndexedDB, in-memory test doubles) provide compare-and-swap
 * semantics so two tabs cannot silently overwrite each other's snapshot.
 */
export interface PersistedSnapshot {
  readonly bytes: Uint8Array;
  /** Monotonic counter; every accepted write increments it. */
  readonly version: number;
}

export interface PersistedBytesStore {
  /** Returns the stored snapshot, or undefined when nothing is stored yet. */
  read: () => Promise<PersistedSnapshot | undefined>;
  /**
   * Stores bytes only when `expectedVersion` still matches the stored version.
   * `expectedVersion` is 0 for the first write (empty store).
   * Returns the committed snapshot, or null when another writer advanced first.
   */
  write: (bytes: Uint8Array, expectedVersion: number) => Promise<PersistedSnapshot | null>;
  /** Removes the stored snapshot. Used after quarantining unreadable bytes. */
  clear: () => Promise<void>;
}

/** In-memory store used by tests and non-browser hosts. */
export function createMemoryPersistedBytesStore(initial?: PersistedSnapshot): PersistedBytesStore {
  let current: PersistedSnapshot | undefined = initial;
  return {
    read: async () => current,
    write: async (bytes, expectedVersion) => {
      if ((current?.version ?? 0) !== expectedVersion) return null;
      current = { bytes, version: expectedVersion + 1 };
      return current;
    },
    clear: async () => {
      current = undefined;
    },
  };
}
