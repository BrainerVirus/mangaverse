import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createEventLog,
  EVENT_LOG_CAP,
  EVENT_LOG_STORAGE_KEY,
  type EventLogStorage,
} from './event-log.js';

// Stand-in with the shape of @app/shared's sanitizeLogMessage, which the app injects;
// the real redactor's behavior is covered in packages/shared/src/redact.test.ts.
const redact = (text: string) =>
  text
    .replace(/Bearer\s+\S+/g, 'Bearer [redacted]')
    .replace(/password=\S+/g, 'password=[redacted]')
    .replace(/\?\S+/g, '');

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: EventLogStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  return { items, storage };
}

const throwing = (): never => {
  throw new Error('SecurityError');
};
const blockedStorage: EventLogStorage = {
  getItem: throwing,
  setItem: throwing,
  removeItem: throwing,
};

describe('event log', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops the oldest events past the cap', async () => {
    const { storage, items } = memoryStorage();
    const log = createEventLog({ redact, storage, cap: 3 });
    for (const message of ['a', 'b', 'c', 'd', 'e']) {
      await log.record({ kind: 'error', message });
    }

    expect((await log.list()).map((event) => event.message)).toEqual(['e', 'd', 'c']);
    expect(JSON.parse(items.get(EVENT_LOG_STORAGE_KEY) ?? '[]')).toHaveLength(3);
  });

  it('defaults to a bounded cap', async () => {
    const log = createEventLog({ redact, storage: memoryStorage().storage });
    await Promise.all(
      Array.from({ length: EVENT_LOG_CAP + 5 }, () =>
        log.record({ kind: 'reader-timing', message: 'tick', durationMs: 4 }),
      ),
    );
    expect(await log.list()).toHaveLength(EVENT_LOG_CAP);
  });

  it('redacts stored and exported text', async () => {
    const { storage, items } = memoryStorage();
    const log = createEventLog({ redact, storage });
    await log.record({
      kind: 'error',
      message: 'GET https://x.test/a?token=s3cret failed: Bearer abc.def password=hunter2',
      code: 'Bearer abc.def',
      providerId: 'p?token=s3cret',
    });

    const exported = await log.export();
    for (const text of [exported, [...items.values()].join('')]) {
      expect(text).not.toContain('s3cret');
      expect(text).not.toContain('abc.def');
      expect(text).not.toContain('hunter2');
    }
    expect(exported).toContain('https://x.test/a');
  });

  it('redacts and validates what it reads back from storage', async () => {
    const { storage, items } = memoryStorage();
    await createEventLog({ redact, storage }).record({ kind: 'error', message: 'seed' });
    items.set(
      EVENT_LOG_STORAGE_KEY,
      JSON.stringify([
        { id: '1', at: '2026-01-01T00:00:00.000Z', kind: 'error', message: 'Bearer abc.def' },
        { id: '2', at: 'not a date', kind: 'error', message: 'bad date' },
        { id: '3', at: '2026-01-01T00:00:00.000Z', kind: 'other', message: 'bad kind' },
        null,
      ]),
    );

    const events = await createEventLog({ redact, storage }).list();
    expect(events.map((event) => event.message)).toEqual(['Bearer [redacted]']);
  });

  it('lists earlier events after a reload, newest first, until cleared', async () => {
    const { storage } = memoryStorage();
    const before = createEventLog({ redact, storage });
    await before.record({ kind: 'error', message: 'first' });
    await before.record({ kind: 'slow-provider-call', message: 'second', durationMs: 900 });

    const after = createEventLog({ redact, storage });
    const events = await after.list();
    expect(events.map((event) => event.message)).toEqual(['second', 'first']);
    expect(events[0]?.durationMs).toBe(900);

    await after.clear();
    expect(await createEventLog({ redact, storage }).list()).toEqual([]);
  });

  it('falls back to memory when storage throws', async () => {
    const log = createEventLog({ redact, storage: blockedStorage });
    await expect(log.record({ kind: 'error', message: 'kept' })).resolves.toBeUndefined();

    expect((await log.list()).map((event) => event.message)).toEqual(['kept']);
    expect(await log.export()).toContain('kept');
    await log.clear();
    expect(await log.list()).toEqual([]);
  });

  it('falls back to memory when localStorage is absent', async () => {
    vi.stubGlobal('localStorage', undefined);
    const log = createEventLog({ redact });
    await log.record({ kind: 'error', message: 'kept' });
    expect(await log.list()).toHaveLength(1);
  });

  it('keeps memory events when a write fails, and stores them once writes recover', async () => {
    const { storage, items } = memoryStorage();
    let full = true;
    const flaky: EventLogStorage = {
      ...storage,
      setItem: (key, value) => {
        if (full) throwing();
        storage.setItem(key, value);
      },
    };
    const log = createEventLog({ redact, storage: flaky });
    await log.record({ kind: 'error', message: 'while full' });
    expect(await log.list()).toHaveLength(1);

    full = false;
    await log.record({ kind: 'error', message: 'recovered' });
    expect(JSON.parse(items.get(EVENT_LOG_STORAGE_KEY) ?? '[]')).toHaveLength(2);
  });

  it('treats corrupt storage as empty and replaces it', async () => {
    const { storage, items } = memoryStorage();
    const seed = createEventLog({ redact, storage });
    await seed.record({ kind: 'error', message: 'seed' });
    items.set(EVENT_LOG_STORAGE_KEY, '{not json');

    const log = createEventLog({ redact, storage });
    await log.record({ kind: 'error', message: 'after' });
    expect((await log.list()).map((event) => event.message)).toEqual(['after']);
  });

  it('makes no outbound request', async () => {
    const fetchSpy = vi.fn<() => void>();
    const beacon = vi.fn<() => void>();
    const xhr = vi.fn<() => void>();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('XMLHttpRequest', xhr);
    vi.stubGlobal('navigator', { sendBeacon: beacon });

    const log = createEventLog({ redact, storage: memoryStorage().storage });
    await log.record({ kind: 'error', message: 'local only' });
    await log.list();
    await log.export();
    await log.clear();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });
});
