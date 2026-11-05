// @vitest-environment node
// A host-ordered list over a scripted change feed: which changes reload the list whole and
// which read only the rows they name.
import type { DataHostChangeEvent, RowChange } from '@app/db/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostListCollection, type HostListOptions } from '../host-collections.js';

interface Row {
  readonly id: string;
  readonly label: string;
}

let ids = 0;

function feed() {
  const listeners = new Set<(event: DataHostChangeEvent) => void>();
  return {
    subscribe: (listener: (event: DataHostChangeEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (...changes: RowChange[]) => {
      for (const listener of listeners) listener({ kind: 'changes', changes });
    },
  };
}

async function listOf(
  rows: Row[],
  options: Partial<
    Pick<HostListOptions<Row>, 'refreshRow' | 'rowTable' | 'patchRows' | 'reloadDelayMs'>
  > = {},
) {
  const changes = feed();
  const host = new Map(rows.map((row) => [row.id, row]));
  const load = vi.fn<() => Promise<Row[]>>(async () => [...host.values()]);
  const refreshRow = vi.fn<(key: string) => Promise<Row | undefined>>(async (key) => host.get(key));
  ids += 1;
  const list = createHostListCollection<Row>({
    id: `host-list-${ids}`,
    load,
    keyOf: (row) => row.id,
    tables: ['library_entries', 'manga_identities'],
    subscribe: changes.subscribe,
    rowTable: 'library_entries',
    refreshRow,
    ...options,
  });
  await list.preload();
  load.mockClear();
  return { list, host, load, refreshRow, emit: changes.emit };
}

const rows: Row[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

describe('host list row refresh', () => {
  it('reads only the changed rows and keeps their place', async () => {
    const { list, host, load, refreshRow, emit } = await listOf(rows);
    host.set('b', { id: 'b', label: 'Beta 2' });
    host.set('c', { id: 'c', label: 'Gamma 2' });
    emit(
      { table: 'library_entries', key: 'b', op: 'update' },
      { table: 'library_entries', key: 'c', op: 'update' },
      // Outside the list's tables: not a reason to reload.
      { table: 'chapter_read_state', key: 'chapter-1', op: 'update' },
    );
    await vi.waitFor(() => expect(list.get('c')?.value.label).toBe('Gamma 2'));

    expect(load).not.toHaveBeenCalled();
    expect(refreshRow.mock.calls.map(([key]) => key).sort()).toEqual(['b', 'c']);
    expect(list.get('b')).toMatchObject({
      key: 'b',
      position: 1,
      value: { id: 'b', label: 'Beta 2' },
    });
    expect(list.get('c')?.position).toBe(2);
  });

  it('reloads whole for a row that no longer belongs, so a bounded list is refilled', async () => {
    const { list, host, load, emit } = await listOf(rows);
    host.delete('a');
    emit({ table: 'library_entries', key: 'a', op: 'update' });
    await vi.waitFor(() => expect(list.has('a')).toBe(false));
    expect(load).toHaveBeenCalledTimes(1);
    expect([...list.keys()].sort()).toEqual(['b', 'c']);
  });

  it('reloads whole for a row it did not hold that now belongs', async () => {
    const { list, host, load, emit } = await listOf(rows);
    host.set('d', { id: 'd', label: 'Delta' });
    emit({ table: 'library_entries', key: 'd', op: 'insert' });
    await vi.waitFor(() => expect(list.get('d')?.position).toBe(3));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads whole for a change to another of its tables', async () => {
    const { list, host, load, refreshRow, emit } = await listOf(rows);
    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit(
      { table: 'library_entries', key: 'a', op: 'update' },
      { table: 'manga_identities', key: 'manga-a', op: 'update' },
    );
    await vi.waitFor(() => expect(list.get('a')?.value.label).toBe('Alpha 2'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(refreshRow).not.toHaveBeenCalled();
  });

  it('reloads whole when its rows can move', async () => {
    const { list, host, load, refreshRow, emit } = await listOf(rows, { patchRows: false });
    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit({ table: 'library_entries', key: 'a', op: 'update' });
    await vi.waitFor(() => expect(list.get('a')?.value.label).toBe('Alpha 2'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(refreshRow).not.toHaveBeenCalled();
  });
});

describe('host list reload delay', () => {
  const DELAY = 250;
  const entryChange = (key: string): RowChange => ({
    table: 'library_entries',
    key,
    op: 'update',
  });
  const otherTable: RowChange = { table: 'manga_identities', key: 'manga-a', op: 'update' };

  async function delayed(options: Parameters<typeof listOf>[1] = {}) {
    const result = await listOf(rows, { reloadDelayMs: DELAY, ...options });
    // After the first load, which the helper awaits on the real clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    return result;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers a burst of change batches with one load after the delay', async () => {
    const { list, host, load, emit } = await delayed();
    host.set('a', { id: 'a', label: 'Alpha 2' });
    for (let burst = 0; burst < 20; burst += 1) emit(otherTable);

    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(list.get('a')?.value.label).toBe('Alpha 2');

    // The next burst starts its own delay.
    emit(otherTable);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refetches at once and cancels the reload that was waiting', async () => {
    const { list, host, load, emit } = await delayed();
    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit(otherTable);

    await list.utils.refetch();
    expect(load).toHaveBeenCalledTimes(1);
    expect(list.get('a')?.value.label).toBe('Alpha 2');

    await vi.advanceTimersByTimeAsync(DELAY * 4);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('patches rows at once, and schedules the reload a reshape needs', async () => {
    const { list, host, load, refreshRow, emit } = await delayed();
    host.set('b', { id: 'b', label: 'Beta 2' });
    emit(entryChange('b'));
    await vi.advanceTimersByTimeAsync(0);
    expect(list.get('b')?.value.label).toBe('Beta 2');
    expect(refreshRow).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();

    // A row leaves the list: the patch sees it, and the reload waits out the delay.
    host.delete('a');
    emit(entryChange('a'));
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(list.has('a')).toBe(true);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(list.has('a')).toBe(false);
  });

  it('runs no reload after the collection stops', async () => {
    const { list, load, emit } = await delayed();
    emit(otherTable);
    await list.cleanup();

    await vi.advanceTimersByTimeAsync(DELAY * 4);
    expect(load).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a pending reload when the subscriber leaves, and runs it on return', async () => {
    const { list, host, load, emit } = await delayed();
    const reader = list.subscribeChanges(() => {});
    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit(otherTable);
    reader.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(DELAY * 4);
    expect(load).not.toHaveBeenCalled();

    // A returning reader does not wait out the delay.
    const back = list.subscribeChanges(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(list.get('a')?.value.label).toBe('Alpha 2');
    back.unsubscribe();
  });

  it('reloads at once without a delay', async () => {
    vi.useRealTimers();
    const { list, host, load, emit } = await listOf(rows);
    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit(otherTable);
    await vi.waitFor(() => expect(list.get('a')?.value.label).toBe('Alpha 2'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('host list without readers', () => {
  const entryChange = (key: string): RowChange => ({
    table: 'library_entries',
    key,
    op: 'update',
  });
  const otherTable: RowChange = { table: 'manga_identities', key: 'manga-a', op: 'update' };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reloads on a change while a subscriber reads it', async () => {
    const { list, host, load, emit } = await listOf(rows);
    const reader = list.subscribeChanges(() => {});
    expect(list.subscriberCount).toBe(1);

    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit(otherTable);
    await vi.waitFor(() => expect(list.get('a')?.value.label).toBe('Alpha 2'));
    expect(load).toHaveBeenCalledTimes(1);
    reader.unsubscribe();
  });

  it('reads nothing for a burst while unwatched, and reloads once on return', async () => {
    const { list, host, load, emit } = await listOf(rows);
    list.subscribeChanges(() => {}).unsubscribe();
    expect(list.subscriberCount).toBe(0);

    host.set('a', { id: 'a', label: 'Alpha 2' });
    for (let burst = 0; burst < 20; burst += 1) emit(otherTable);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(load).not.toHaveBeenCalled();
    expect(list.get('a')?.value.label).toBe('Alpha');

    const back = list.subscribeChanges(() => {});
    await vi.waitFor(() => expect(list.get('a')?.value.label).toBe('Alpha 2'));
    expect(load).toHaveBeenCalledTimes(1);
    back.unsubscribe();
  });

  it('starts no timer for a change while unwatched', async () => {
    const { list, load, emit } = await listOf(rows, { reloadDelayMs: 250 });
    list.subscribeChanges(() => {}).unsubscribe();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    emit(otherTable);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).not.toHaveBeenCalled();
  });

  it('marks a row change stale instead of patching it, and the return reload brings it in', async () => {
    const { list, host, load, refreshRow, emit } = await listOf(rows);
    list.subscribeChanges(() => {}).unsubscribe();

    host.set('b', { id: 'b', label: 'Beta 2' });
    emit(entryChange('b'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(refreshRow).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(list.get('b')?.value.label).toBe('Beta');

    const back = list.subscribeChanges(() => {});
    await vi.waitFor(() => expect(list.get('b')?.value.label).toBe('Beta 2'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(refreshRow).not.toHaveBeenCalled();
    back.unsubscribe();
  });

  it('does not reload on return when nothing changed meanwhile', async () => {
    const { list, load } = await listOf(rows);
    list.subscribeChanges(() => {}).unsubscribe();
    const back = list.subscribeChanges(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(load).not.toHaveBeenCalled();
    back.unsubscribe();
  });

  it('is not idle before its first subscriber: a preload still loads and reloads', async () => {
    const changes = feed();
    const host = new Map(rows.map((row) => [row.id, row]));
    const load = vi.fn<() => Promise<Row[]>>(async () => [...host.values()]);
    ids += 1;
    const list = createHostListCollection<Row>({
      id: `host-list-${ids}`,
      load,
      keyOf: (row) => row.id,
      tables: ['library_entries', 'manga_identities'],
      subscribe: changes.subscribe,
    });
    await list.preload();
    expect(list.subscriberCount).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(list.size).toBe(3);

    // No reader has come yet: a change in the handoff window is not lost.
    host.set('a', { id: 'a', label: 'Alpha 2' });
    changes.emit({ table: 'manga_identities', key: 'manga-a', op: 'update' });
    await vi.waitFor(() => expect(list.get('a')?.value.label).toBe('Alpha 2'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refetches while unwatched, and a change before that read needs no second one', async () => {
    const { list, host, load, emit } = await listOf(rows);
    list.subscribeChanges(() => {}).unsubscribe();

    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit(otherTable);
    await list.utils.refetch();
    expect(load).toHaveBeenCalledTimes(1);
    expect(list.get('a')?.value.label).toBe('Alpha 2');

    const back = list.subscribeChanges(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(load).toHaveBeenCalledTimes(1);
    back.unsubscribe();
  });

  it('reads after a change that lands while a reload is running on return', async () => {
    const { list, host, load, emit } = await listOf(rows);
    list.subscribeChanges(() => {}).unsubscribe();
    emit(otherTable);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    load.mockImplementationOnce(async () => {
      const snapshot = [...host.values()];
      await gate;
      return snapshot;
    });
    const back = list.subscribeChanges(() => {});
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    // The running read took its snapshot before this write; the change is watched, so it reloads.
    host.set('a', { id: 'a', label: 'Alpha 2' });
    emit(otherTable);
    release();
    await vi.waitFor(() => expect(list.get('a')?.value.label).toBe('Alpha 2'));
    expect(load).toHaveBeenCalledTimes(2);
    back.unsubscribe();
  });

  it('drops its subscription and timers when it stops', async () => {
    const { list, load, emit } = await listOf(rows, { reloadDelayMs: 250 });
    const reader = list.subscribeChanges(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    emit(otherTable);
    expect(vi.getTimerCount()).toBe(1);

    await list.cleanup();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).not.toHaveBeenCalled();
    reader.unsubscribe();
  });

  it('removes its subscribers listener when it stops', async () => {
    const changes = feed();
    ids += 1;
    const list = createHostListCollection<Row>({
      id: `host-list-${ids}`,
      load: async () => rows,
      keyOf: (row) => row.id,
      tables: ['library_entries'],
      subscribe: changes.subscribe,
    });
    const removed = vi.fn<() => void>();
    const on = list.on.bind(list);
    const spy = vi.spyOn(list, 'on').mockImplementation((event, callback) => {
      const off = on(event, callback);
      return () => {
        if (event === 'subscribers:change') removed();
        off();
      };
    });
    await list.preload();
    expect(spy).toHaveBeenCalledWith('subscribers:change', expect.any(Function));
    expect(removed).not.toHaveBeenCalled();

    await list.cleanup();
    expect(removed).toHaveBeenCalledTimes(1);
  });
});
