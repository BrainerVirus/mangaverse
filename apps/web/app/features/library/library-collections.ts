import type { AppDrizzleDb } from '@app/db';
import {
  createAppError,
  type LibraryCategory,
  type LibraryEntryId,
  type LibraryStatus,
  type LibraryViewState,
  type ProviderId,
} from '@app/shared';
import {
  createHostListCollection,
  type ChangeFeed,
  type HostListCollection,
  type ListedRow,
} from '../../lib/host-collections.js';
import { fetchLibraryItems } from './fetch-library-page.js';
import type { LibraryItem } from './types.js';

// The library list's collections (#210 tracer): the titles of a view, the categories and the
// providers, each a host-ordered list that reloads when a committed change touches it.

export interface LibraryCollections {
  readonly items: HostListCollection<LibraryItem>;
  readonly categories: HostListCollection<LibraryCategory>;
  readonly providers: HostListCollection<{ readonly id: ProviderId }>;
}

/** A host rejection a mutation handler throws, so TanStack DB rolls the optimistic rows back. */
class LibraryWriteRejected extends Error {
  readonly code: string;
  constructor(error: { readonly code: string; readonly message: string }) {
    super(error.message);
    this.name = 'LibraryWriteRejected';
    this.code = error.code;
  }
}

/** What a library title's displayed row depends on. */
const ITEM_TABLES = [
  'library_entries',
  'library_category_memberships',
  'manga_identities',
  'manga_provider_mappings',
  'chapters',
  'chapter_read_state',
] as const;

type EntryEdit =
  | { readonly field: 'status'; readonly value: LibraryStatus }
  | { readonly field: 'favorite'; readonly value: boolean };

/**
 * Writes what an optimistic update changed, grouped per value, through the repositories the
 * bulk bar used. A refusal throws, which rolls the optimistic rows back.
 */
async function persistEntryEdits(
  db: AppDrizzleDb,
  updates: readonly {
    readonly original: ListedRow<LibraryItem>;
    readonly modified: ListedRow<LibraryItem>;
  }[],
): Promise<void> {
  const { setLibraryEntriesFavorite, setLibraryEntriesStatus } = await import('@app/db');
  const groups = new Map<string, { edit: EntryEdit; ids: LibraryEntryId[] }>();
  const add = (edit: EntryEdit, id: LibraryEntryId) => {
    const key = `${edit.field}:${String(edit.value)}`;
    const group = groups.get(key) ?? { edit, ids: [] };
    group.ids.push(id);
    groups.set(key, group);
  };
  for (const { original, modified } of updates) {
    const before = original.value.entry;
    const after = modified.value.entry;
    if (after.status !== before.status) add({ field: 'status', value: after.status }, after.id);
    if (after.favorite !== before.favorite) {
      add({ field: 'favorite', value: after.favorite }, after.id);
    }
  }
  // A bulk action edits one field to one value: one group. With more, a refusal rolls this
  // window back and the broadcast of what did commit brings it in again.
  const results = await Promise.all(
    [...groups.values()].map(({ edit, ids }) =>
      edit.field === 'status'
        ? setLibraryEntriesStatus(db, ids, edit.value)
        : setLibraryEntriesFavorite(db, ids, edit.value),
    ),
  );
  for (const result of results) {
    if (!result.ok) throw new LibraryWriteRejected(result.error);
  }
}

const viewKey = (viewState: LibraryViewState) => JSON.stringify([viewState.sort, viewState.filter]);

interface DbCollections {
  /** Collection ids must be unique: each `db` gets its own scope. */
  readonly scope: number;
  readonly views: Map<string, LibraryCollections>;
}

let scopes = 0;
const cache = new WeakMap<AppDrizzleDb, DbCollections>();

/**
 * One set of collections per `db` and view; categories and providers are shared by every view.
 * A view's layout does not change what loads, so it is not part of the key. A new `db` (another
 * tab's snapshot on the web) starts fresh.
 */
export function libraryCollections(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
  subscribe: ChangeFeed,
): LibraryCollections {
  let entry = cache.get(db);
  if (entry === undefined) {
    scopes += 1;
    entry = { scope: scopes, views: new Map() };
    cache.set(db, entry);
  }
  const key = viewKey(viewState);
  const existing = entry.views.get(key);
  if (existing !== undefined) return existing;

  const shared = entry.views.values().next().value;
  const scope = `library:${entry.scope}`;
  const collections: LibraryCollections = {
    items: createHostListCollection<LibraryItem>({
      id: `${scope}:items:${key}`,
      load: () => fetchLibraryItems(db, viewState),
      keyOf: (item) => item.entry.id,
      tables: ITEM_TABLES,
      subscribe,
      persistUpdate: (updates) => persistEntryEdits(db, updates),
    }),
    categories:
      shared?.categories ??
      createHostListCollection<LibraryCategory>({
        id: `${scope}:categories`,
        load: async () => (await import('@app/db')).listLibraryCategories(db),
        keyOf: (category) => category.id,
        tables: ['categories'],
        subscribe,
      }),
    providers:
      shared?.providers ??
      createHostListCollection<{ readonly id: ProviderId }>({
        id: `${scope}:providers`,
        load: async () =>
          (await (await import('@app/db')).listLibraryProviderIds(db)).map((id) => ({ id })),
        keyOf: (provider) => provider.id,
        tables: ['manga_provider_mappings', 'library_entries'],
        subscribe,
      }),
  };
  entry.views.set(key, collections);
  return collections;
}

/**
 * Applies a status or favorite change to the given titles at once, in this window's list, and
 * writes it to the host. Resolves once the host's rows are in; rejects, with the optimistic
 * change rolled back, when the host refuses it.
 */
export function editEntriesOptimistically(
  items: HostListCollection<LibraryItem>,
  entryIds: readonly LibraryEntryId[],
  edit: EntryEdit,
): Promise<void> {
  const held = entryIds.filter((id) => items.has(id));
  if (held.length === 0) {
    return Promise.reject(
      new LibraryWriteRejected(
        createAppError({ code: 'db.library.entry_missing', message: 'Library entry not found.' }),
      ),
    );
  }
  const transaction = items.update(held, (drafts) => {
    for (const draft of drafts) {
      if (edit.field === 'status') draft.value.entry.status = edit.value;
      else draft.value.entry.favorite = edit.value;
    }
  });
  return transaction.when('settled').then(() => undefined);
}
