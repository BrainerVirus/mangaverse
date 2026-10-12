export type FlushOnceResult = { readonly status: 'saved' | 'reloaded' };

export interface FlushCoordinator {
  /**
   * Resolves only once every mutation known at call time is durable.
   *
   * A flush that is already in flight covers only the writes captured when it
   * started; requests arriving after newer writes must trigger another flush
   * instead of returning early on the pending one.
   */
  readonly request: () => Promise<void>;
}

export function createFlushCoordinator(deps: {
  readonly flushOnce: () => Promise<FlushOnceResult>;
  readonly currentSeq: () => number;
}): FlushCoordinator {
  let flushedSeq = 0;
  let pending: Promise<void> | null = null;

  const runOnce = async (seqAtStart: number): Promise<void> => {
    const result = await deps.flushOnce();
    if (result.status === 'saved') {
      flushedSeq = seqAtStart;
    } else {
      // A reload replaced local state with the store snapshot; nothing local is
      // left to persist, so treat everything known now as flushed.
      flushedSeq = deps.currentSeq();
    }
  };

  const request = async (): Promise<void> => {
    const target = deps.currentSeq();
    while (flushedSeq < target) {
      if (pending !== null) {
        await pending;
        continue;
      }
      const seqAtStart = deps.currentSeq();
      pending = runOnce(seqAtStart).finally(() => {
        pending = null;
      });
      await pending;
    }
  };

  return { request };
}
