import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { openCalls, sessionBehavior } = vi.hoisted(() => ({
  openCalls: [] as { onMutation?: () => void }[],
  sessionBehavior: { flushThrows: false },
}));

vi.mock('sql.js', () => {
  const init = async () => ({ Database: class {} });
  return { default: init, initSqlJs: init };
});

vi.mock('@app/db/browser', () => ({
  openPersistentDatabase: async (input: { onMutation?: () => void }) => {
    openCalls.push(input);
    return {
      db: {},
      raw: {},
      quarantinedBytes: false,
      flush: async () => {
        if (sessionBehavior.flushThrows) {
          throw new Error('QuotaExceededError: storage denied');
        }
        return { status: 'saved' as const };
      },
      syncFromStore: async () => {},
      close: () => {},
    };
  },
}));

import { flushLocalDb, resetLocalDb, setPersistenceErrorHandler } from '../local-db.js';
import { getLocalDbSession } from '../local-db.js';

describe('local-db persistence error reporting', () => {
  beforeEach(async () => {
    openCalls.length = 0;
    sessionBehavior.flushThrows = false;
    resetLocalDb();
    await getLocalDbSession();
    // Simulate a write so the coordinator has something to flush.
    openCalls.at(-1)?.onMutation?.();
  });

  afterEach(() => {
    setPersistenceErrorHandler(null);
    resetLocalDb();
  });

  it('Given a failing flush, When flushLocalDb runs, Then the handler receives the error message', async () => {
    sessionBehavior.flushThrows = true;
    const handler = vi.fn<(...args: unknown[]) => unknown>();
    setPersistenceErrorHandler(handler);

    await flushLocalDb();

    expect(handler).toHaveBeenCalledWith(expect.stringContaining('out of storage'));
  });

  it('Given a successful flush, When flushLocalDb runs, Then the handler is cleared', async () => {
    const handler = vi.fn<(...args: unknown[]) => unknown>();
    setPersistenceErrorHandler(handler);

    await flushLocalDb();

    expect(handler).toHaveBeenCalledWith(null);
  });
});
