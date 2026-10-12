import { describe, expect, it } from 'vitest';
import { createFlushCoordinator } from '../local-db-flush.js';

describe('flush coordinator', () => {
  it('Given no in-flight flush, When requested, Then it flushes once and settles', async () => {
    let seq = 1;
    let calls = 0;
    const coordinator = createFlushCoordinator({
      flushOnce: async () => {
        calls += 1;
        return { status: 'saved' };
      },
      currentSeq: () => seq,
    });

    await coordinator.request();
    expect(calls).toBe(1);
  });

  it('Given a flush in flight and a newer write, When requested, Then it flushes again for the newer write', async () => {
    let seq = 1;
    let calls = 0;
    let releaseFirst: (() => void) | null = null;
    const coordinator = createFlushCoordinator({
      flushOnce: async () => {
        calls += 1;
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return { status: 'saved' };
      },
      currentSeq: () => seq,
    });

    const first = coordinator.request(); // flush #1 starts and parks
    expect(calls).toBe(1);
    seq = 2; // a newer write lands while flush #1 is still in flight
    const second = coordinator.request();
    releaseFirst?.();
    await Promise.all([first, second]);

    // The second request must not settle on the stale in-flight flush.
    expect(calls).toBe(2);
  });

  it('Given a reloaded flush, When requested with an already-advanced sequence, Then it does not spin', async () => {
    let seq = 1;
    let calls = 0;
    const coordinator = createFlushCoordinator({
      flushOnce: async () => {
        calls += 1;
        seq += 1; // an external write advanced while the reload happened
        return { status: 'reloaded' };
      },
      currentSeq: () => seq,
    });

    await coordinator.request();
    expect(calls).toBe(1);
  });
});
