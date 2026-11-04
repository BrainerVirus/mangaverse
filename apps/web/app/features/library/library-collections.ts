import type { AppDrizzleDb } from '@app/db';
import {
  createAppError,
  LIBRARY_PAGE_MAX,
  toLibraryEntryId,
  type LibraryCategory,
  type LibraryEntryId,
  type LibrarySortKey,
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
import {
  fetchLibraryItem,
  fetchLibraryItems,
  fetchLibraryTotal,
  LIBRARY_PAGE_SIZE,
} from './fetch-library-page.js';
import type { LibraryItem } from './types.js';

// The library list's collections (#210 tracer): the loaded page of a view, the view's match
// total, its categories and its providers. Each is a host-ordered list that reloads when a
// committed change touches it; only the page is bounded, and it grows on request.

export interface LibraryCollections {
  readonly items: HostListCollection<LibraryItem>;
  /** One row: how many titles the filter matches, independent of the loaded page. */
  readonly total: HostListCollection<{ readonly total: number }>;
  readonly categories: HostListCollection<LibraryCategory>;
  readonly providers: HostListCollection<{ readonly id: ProviderId }>;
  /** Asks for one more page and refreshes the loaded rows; resolves once they are in. */
  loadMore(): Promise<void>;
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

/**
 * What a library title's displayed row depends on. The page counts unread from `chapters`
 * live, and a provider refresh inserts chapters without a recount, so they stay. Read state
 * is left out: every writer pairs it with a write to a table here. The reader's save and the
 * explicit marks write `library_entries` (progress, unread recount); a merge, an unmerge and
 * a restore write `manga_identities` and `library_entries` in the same transaction.
 */
const ITEM_TABLES = [
  'library_entries',
  'library_category_memberships',
  'manga_identities',
  'manga_provider_mappings',
  'chapters',
] as const;

/**
 * Sorts an entry write cannot move a title in. A progress save writes the unread count,
 * progress and updated time (`persistReaderProgress`); the provider switcher writes the active
 * mapping, which the provider sort ranks by. Title and date added are set elsewhere.
 */
const ROW_STABLE_SORTS: ReadonlySet<LibrarySortKey> = new Set(['title', 'date_added']);

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

/** The loaded window's last row in the host's order. */
function lastListed(items: HostListCollection<LibraryItem>): ListedRow<LibraryItem> | undefined {
  let last: ListedRow<LibraryItem> | undefined;
  for (const row of items.values()) {
    if (last === undefined || row.position > last.position) last = row;
  }
  return last;
}

interface DbCollections {
  /** Collection ids must be unique: each `db` gets its own scope. */
  readonly scope: number;
  readonly views: Map<string, LibraryCollections>;
  /** Pages loaded per view key; a filter or sort change starts at one again. */
  readonly pages: Map<string, number>;
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
    entry = { scope: scopes, views: new Map(), pages: new Map() };
    cache.set(db, entry);
  }
  const store = entry;
  const key = viewKey(viewState);
  const existing = store.views.get(key);
  if (existing !== undefined) return existing;

  const shared = store.views.values().next().value;
  const scope = `library:${store.scope}`;
  // A page counter per view: a change-feed reload keeps the pages already loaded, a new
  // filter or sort starts from the first page.
  const loadedPages = () => store.pages.get(key) ?? 1;
  const windowLimit = (pages: number) => Math.min(LIBRARY_PAGE_SIZE * pages, LIBRARY_PAGE_MAX);
  const items: HostListCollection<LibraryItem> = createHostListCollection<LibraryItem>({
    id: `${scope}:items:${key}`,
    load: () =>
      fetchLibraryItems(db, viewState, { limit: windowLimit(loadedPages()) }).then(
        (page) => page.items,
      ),
    keyOf: (item) => item.entry.id,
    tables: ITEM_TABLES,
    subscribe,
    // An entry change reads that title alone where it cannot have moved.
    rowTable: 'library_entries',
    refreshRow: (entryId) => {
      const id = toLibraryEntryId(entryId);
      const last = items.has(id) ? undefined : lastListed(items);
      // A title the loaded window does not hold belongs to it only if it ranks before the
      // window's last row; while the window holds the whole view, any match belongs.
      return items.size < windowLimit(loadedPages()) || last === undefined
        ? fetchLibraryItem(db, viewState, id)
        : fetchLibraryItem(db, viewState, id, toLibraryEntryId(last.key));
    },
    patchRows: ROW_STABLE_SORTS.has(viewState.sort.key),
    persistUpdate: (updates) => persistEntryEdits(db, updates),
  });
  const collections: LibraryCollections = {
    items,
    total: createHostListCollection<{ readonly total: number }>({
      id: `${scope}:total:${key}`,
      load: async () => [{ total: await fetchLibraryTotal(db, viewState) }],
      keyOf: () => 'total',
      tables: ITEM_TABLES,
      subscribe,
    }),
    loadMore: async () => {
      if (windowLimit(loadedPages()) >= LIBRARY_PAGE_MAX) return;
      store.pages.set(key, loadedPages() + 1);
      await items.utils.refetch();
    },
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
  store.views.set(key, collections);
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
