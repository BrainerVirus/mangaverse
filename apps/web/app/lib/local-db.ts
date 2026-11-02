import type { AppDrizzleDb } from '@app/db/browser';
import type { BundledMigrationJournal } from '@app/db/browser';
import type {
  DataHostChangeEvent,
  DataHostClient,
  DataHostClientPort,
  PersistentDatabase,
} from '@app/db/browser';
import { notify } from '@app/design-system';
import type { AppResult } from '@app/shared';
import type { SqlJsStatic } from 'sql.js';
import { failureMessage, feedback } from './app-feedback.js';
import { createFlushCoordinator } from './local-db-flush.js';

let dbPromise: Promise<PersistentDatabase> | undefined;
/** The Electron data host's handle; `null` when its import failed and sql.js stays in use. */
let hostPromise: Promise<AppDrizzleDb | null> | undefined;
/** The connected data host client; `null` on the web and after a failed import. */
let hostClient: DataHostClient | null = null;
let generation = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const INITIAL_MIGRATION_HASH = '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea';

const CACHE_ASSET_MIGRATION_HASH =
  'be8c129e37327e353096a7daf815a2963471cbc0429ca76b2b5a2129251fd175';

const THEMES_MIGRATION_HASH = 'b82ae03e19ad700a913d2407db98b5c89dbe24913d764eaa01b116b930f4fdd5';

const LIBRARY_UNIQUE_MANGA_MIGRATION_HASH =
  '438c0cf16e33a1fbd49d724396f8babf64c778498ff3daffbafd76a690fdbf42';

const MIGRATION_HISTORY_UNDO_MIGRATION_HASH =
  'bd23ab297e509cdcf4fd4ed91bb7cebb3a4236549257c507bb6d103cf9a7f6ef';
const LIBRARY_CATEGORY_PINNED_MIGRATION_HASH =
  'f88fba5bb7715abf811036f0da8d3a895956819fc07782392454640c3ae755b9';
const INSTALLED_EXTENSION_MANIFEST_URL_MIGRATION_HASH =
  'bd9dd7619965a6b2a7d88a59d84e65b58f179683c738edcf676703a04047f6fc';
const EXTENSION_LOGS_MIGRATION_HASH =
  'f5f3e68be2c6f46ff21681f230763e499e788ed133b0de3df942b443b5f07d12';

type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;

export type SqlJsDynamicModule = {
  default?: unknown;
  initSqlJs?: unknown;
};

/** Resolves initSqlJs across ESM/CJS/Vite dynamic-import interop shapes. */
export function resolveInitSqlJs(sqlModule: SqlJsDynamicModule | InitSqlJs): InitSqlJs {
  const unwrap = (value: unknown, depth = 0): unknown => {
    if (depth > 4) return value;
    if (typeof value === 'function') return value;
    if (!value || typeof value !== 'object') return value;

    const record = value as SqlJsDynamicModule;
    if (typeof record.initSqlJs === 'function') return record.initSqlJs;

    const nestedDefault = record.default;
    if (typeof nestedDefault === 'function') return nestedDefault;
    if (nestedDefault && typeof nestedDefault === 'object') {
      return unwrap(nestedDefault, depth + 1);
    }

    return value;
  };

  const candidate = unwrap(typeof sqlModule === 'function' ? sqlModule : sqlModule);

  if (typeof candidate !== 'function') {
    throw new Error('sql.js dynamic import did not provide initSqlJs');
  }

  return candidate as InitSqlJs;
}

export function resolveWasmAssetUrl(wasmModule: { default?: unknown }): string {
  const url = wasmModule.default;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('sql.js WASM asset import did not provide a URL');
  }
  return url;
}

export function resetLocalDb(): void {
  const session = dbPromise;
  dbPromise = undefined;
  hostPromise = undefined;
  hostClient = null;
  generation += 1;
  if (session !== undefined) {
    // Close the WASM database so retries do not leak memory.
    void session.then((handle) => handle.close()).catch(() => {});
  }
}

/** Opens (or returns) the durable local database session. */
export function getLocalDbSession(): Promise<PersistentDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Local DB is only available in the browser'));
  }

  if (dbPromise === undefined) {
    const holder: { current?: Promise<PersistentDatabase> } = {};
    const attempt = (async () => {
      try {
        const [
          sqlModule,
          wasmModule,
          { openPersistentDatabase },
          { default: initialMigrationSql },
          { default: cacheAssetMigrationSql },
          { default: themesMigrationSql },
          { default: libraryUniqueMangaMigrationSql },
          { default: migrationHistoryUndoMigrationSql },
          { default: libraryCategoryPinnedMigrationSql },
          { default: installedExtensionManifestUrlMigrationSql },
          { default: extensionLogsMigrationSql },
          { default: migrationJournal },
          { createIndexedDbPersistedBytesStore },
        ] = await Promise.all([
          import('sql.js'),
          import('sql.js/dist/sql-wasm.wasm?url'),
          import('@app/db/browser'),
          import('@app/db/migrations/0000_initial.sql?raw'),
          import('@app/db/migrations/0001_cache_asset_metadata.sql?raw'),
          import('@app/db/migrations/0002_themes.sql?raw'),
          import('@app/db/migrations/0003_library_unique_manga.sql?raw'),
          import('@app/db/migrations/0004_migration_history_undo.sql?raw'),
          import('@app/db/migrations/0005_library_category_pinned.sql?raw'),
          import('@app/db/migrations/0006_installed_extension_manifest_url.sql?raw'),
          import('@app/db/migrations/0007_extension_logs.sql?raw'),
          import('@app/db/migrations/meta/_journal.json'),
          import('./persisted-bytes-idb.js'),
        ]);

        const initSqlJs = resolveInitSqlJs(sqlModule);
        const sqlWasm = resolveWasmAssetUrl(wasmModule);

        const SQL = await initSqlJs({
          locateFile: () => sqlWasm,
        });

        return openPersistentDatabase({
          sqlModule: SQL,
          store: createIndexedDbPersistedBytesStore(),
          // Coalesced snapshot writes after every mutation; unload is a fallback,
          // not the only durability point.
          onMutation: () => {
            mutationSeq += 1;
            scheduleLocalDbFlush();
            for (const listener of sessionListeners) listener({ kind: 'resync' });
          },
          migrations: {
            journal: migrationJournal as BundledMigrationJournal,
            files: [
              {
                tag: '0000_initial',
                sql: initialMigrationSql,
                hash: INITIAL_MIGRATION_HASH,
              },
              {
                tag: '0001_cache_asset_metadata',
                sql: cacheAssetMigrationSql,
                hash: CACHE_ASSET_MIGRATION_HASH,
              },
              {
                tag: '0002_themes',
                sql: themesMigrationSql,
                hash: THEMES_MIGRATION_HASH,
              },
              {
                tag: '0003_library_unique_manga',
                sql: libraryUniqueMangaMigrationSql,
                hash: LIBRARY_UNIQUE_MANGA_MIGRATION_HASH,
              },
              {
                tag: '0004_migration_history_undo',
                sql: migrationHistoryUndoMigrationSql,
                hash: MIGRATION_HISTORY_UNDO_MIGRATION_HASH,
              },
              {
                tag: '0005_library_category_pinned',
                sql: libraryCategoryPinnedMigrationSql,
                hash: LIBRARY_CATEGORY_PINNED_MIGRATION_HASH,
              },
              {
                tag: '0006_installed_extension_manifest_url',
                sql: installedExtensionManifestUrlMigrationSql,
                hash: INSTALLED_EXTENSION_MANIFEST_URL_MIGRATION_HASH,
              },
              {
                tag: '0007_extension_logs',
                sql: extensionLogsMigrationSql,
                hash: EXTENSION_LOGS_MIGRATION_HASH,
              },
            ],
          },
        });
      } catch (error) {
        // Only clear the slot when this attempt is still the current one; a
        // retry that created a newer promise must not be clobbered.
        if (dbPromise === holder.current) {
          dbPromise = undefined;
        }
        throw error;
      }
    })();
    holder.current = attempt;
    dbPromise = attempt;
  }
  return dbPromise;
}

interface DataHostBridge {
  connect(): Promise<AppResult<void>>;
}

/** Present only in the Electron app, where the preload exposes it. */
function dataHostBridge(): DataHostBridge | undefined {
  return (window as { mangaverseDataHost?: DataHostBridge }).mangaverseDataHost;
}

/** The window message the preload posts with the data host port. */
const DATA_HOST_PORT_MESSAGE = 'mangaverse:data-host-port';

function portOf(event: MessageEvent): MessagePort | undefined {
  const [port] = event.ports;
  return event.source === window && event.data === DATA_HOST_PORT_MESSAGE ? port : undefined;
}

function receiveDataHostPort(bridge: DataHostBridge): Promise<MessagePort> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const port = portOf(event);
      if (!port) return;
      window.removeEventListener('message', onMessage);
      resolve(port);
    };
    window.addEventListener('message', onMessage);
    void bridge.connect().then(
      async (result) => {
        if (result.ok) return;
        window.removeEventListener('message', onMessage);
        const { DataHostError } = await import('@app/db/browser');
        reject(new DataHostError(result.error));
      },
      (error: unknown) => {
        window.removeEventListener('message', onMessage);
        reject(error);
      },
    );
  });
}

function clientPort(port: MessagePort): DataHostClientPort {
  return {
    postMessage: (request) => port.postMessage(request),
    onMessage: (listener) => {
      port.onmessage = (event) => listener(event.data);
    },
  };
}

/**
 * Main restarted a host that stopped and handed this window a port to it. The handle every
 * caller holds stays the same object, so nothing re-renders to pick it up; the user is told,
 * since a save that was in flight when it stopped ends with a timeout.
 */
async function reconnectDataHost(client: DataHostClient, port: MessagePort): Promise<void> {
  const reopened = await client.reconnect(clientPort(port));
  if (!reopened.ok) {
    const { DataHostError } = await import('@app/db/browser');
    feedback.onFailure(new DataHostError(reopened.error), {
      source: 'data-host.reconnect',
      feedback: { surface: 'toast', message: 'The local library could not be reopened.' },
    });
    return;
  }
  feedback.log(
    { code: 'data-host.restarted', message: 'The data host restarted.' },
    'data-host.reconnect',
  );
  notify.failure({
    key: 'data-host.restarted',
    message:
      'The local library stopped and was restarted. Saved changes are safe; a change that was saving may need to be made again.',
  });
}

/** Listeners on the sql.js session, which has no host to say what changed. */
const sessionListeners = new Set<(event: DataHostChangeEvent) => void>();

/**
 * Hears committed changes: the data host's batches (ADR 0001, decision 6), or, on the web and
 * the sql.js fallback, a `resync` after each local write.
 */
export function subscribeToLocalChanges(
  listener: (event: DataHostChangeEvent) => void,
): () => void {
  if (hostClient !== null) return hostClient.onChange(listener);
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/** Keeps the window's handle on a host it may reconnect to after a host restart. */
function attachHostClient(client: DataHostClient): void {
  hostClient = client;
  window.addEventListener('message', (event) => {
    const next = portOf(event);
    // A retry after a reset connects a new client; this one is done.
    if (next && hostClient === client) void reconnectDataHost(client, next);
  });
}

/**
 * Connects to the Electron data host, where SQLite runs natively (ADR 0001). On the first
 * start without a native database, the sql.js snapshot is handed over once to be imported;
 * the snapshot itself is only read. Before that import, the renderer-data coordinator (#213)
 * moves IndexedDB page and cover bytes into the page store, so the verified copy rewrites
 * their pointers in the same pass. A failed snapshot import resolves `null` so the window
 * keeps using that snapshot, and the next start tries again.
 */
async function openDataHost(bridge: DataHostBridge): Promise<AppDrizzleDb | null> {
  const [{ createDataHostClient, DataHostError, DATA_HOST_ERROR }, port] = await Promise.all([
    import('@app/db/browser'),
    receiveDataHostPort(bridge),
  ]);
  const client = createDataHostClient(clientPort(port));
  const status = await client.status();
  if (!status.ok) throw new DataHostError(status.error);

  let snapshot: Uint8Array | null = null;
  if (!status.value.open && !status.value.nativeExists) {
    const { createIndexedDbPersistedBytesStore } = await import('./persisted-bytes-idb.js');
    snapshot = (await createIndexedDbPersistedBytesStore().read())?.bytes ?? null;
  }

  const { createRendererImportDeps, runRendererDataImport } =
    await import('./renderer-data-import.js');
  const importDeps = createRendererImportDeps(
    (bytes, rewrites) => client.open(bytes, rewrites),
    async (rewrites) => {
      // A #210 profile already holds its rows; move their cache pointers in one transaction.
      const applied = await client.handle.call('rewriteCacheBlobKeys', [rewrites]);
      return typeof applied === 'number' ? applied : 0;
    },
    snapshot,
  );
  // A marker without its native database is a lost verified state (the profile was pruned or
  // restored partially), so the move runs again rather than opening a half-made profile.
  const needsRestore = !status.value.open && !status.value.nativeExists && snapshot !== null;
  const deps =
    importDeps === undefined
      ? undefined
      : needsRestore
        ? { ...importDeps, force: true }
        : importDeps;

  if (deps !== undefined) {
    const outcome = await runRendererDataImport(deps);
    if (outcome.status === 'complete') {
      attachHostClient(client);
      return client.handle;
    }
    if (outcome.status === 'failed') {
      // The host opened before the failure: the window keeps using it, with a visible retry.
      if (outcome.hostOpened && outcome.openResult?.ok === true) {
        attachHostClient(client);
        return client.handle;
      }
      // Never opened: no native file exists, so the untouched sql.js snapshot stays in use.
      if (outcome.openResult !== null && !outcome.openResult.ok) {
        if (outcome.openResult.error.code !== DATA_HOST_ERROR.importFailed) {
          throw new DataHostError(outcome.openResult.error);
        }
      }
      return null;
    }
    // Nothing to move; fall through and open the host the ordinary way.
  }

  const opened = await client.open(snapshot);
  if (opened.ok) {
    attachHostClient(client);
    return client.handle;
  }
  if (opened.error.code !== DATA_HOST_ERROR.importFailed) throw new DataHostError(opened.error);
  return null;
}

/**
 * The `db` repositories take: the data host's handle in the Electron app, the sql.js session's
 * Drizzle handle on the web (and in Electron after a failed import).
 */
export async function getLocalDb(): Promise<AppDrizzleDb> {
  const bridge = typeof window === 'undefined' ? undefined : dataHostBridge();
  if (bridge !== undefined) {
    if (hostPromise === undefined) {
      const attempt = openDataHost(bridge);
      hostPromise = attempt;
      // A failed connect is retried on the next call rather than cached.
      void attempt.then(undefined, () => {
        if (hostPromise === attempt) hostPromise = undefined;
      });
    }
    const handle = await hostPromise;
    if (handle !== null) return handle;
  }
  const session = await getLocalDbSession();
  return session.db;
}

const SYNC_NOTIFY_KEY = 'mangaverse.local-db.version';
let mutationSeq = 0;

let persistenceErrorHandler: ((message: string | null) => void) | null = null;

/** Registers the UI sink for durable-write failures; pass null to clear. */
export function setPersistenceErrorHandler(
  handler: ((message: string | null) => void) | null,
): void {
  persistenceErrorHandler = handler;
}

async function flushOnce(): Promise<{ status: 'saved' | 'reloaded' }> {
  if (dbPromise === undefined) return { status: 'saved' };
  const openedAt = generation;
  const session = await dbPromise;
  // A reset while this flush awaited replaces the session; skip the stale one.
  if (openedAt !== generation) return { status: 'saved' };
  const result = await session.flush();
  if (result.status === 'reloaded') {
    await session.syncFromStore();
    return { status: 'reloaded' };
  }
  // Ping other tabs; storage events do not fire in the writing tab.
  try {
    localStorage.setItem(SYNC_NOTIFY_KEY, String(Date.now()));
  } catch {
    // A blocked storage notification must not fail the committed write.
  }
  return { status: 'saved' };
}

const flushCoordinator = createFlushCoordinator({
  flushOnce,
  currentSeq: () => mutationSeq,
});

/** Durability point; resolves only once writes known at call time are durable. */
export async function flushLocalDb(): Promise<void> {
  try {
    await flushCoordinator.request();
    persistenceErrorHandler?.(null);
  } catch (error) {
    // Surface the failure for the UI and keep it out of unhandled rejections.
    persistenceErrorHandler?.(failureMessage(error, 'The local save did not finish.'));
    // oxlint-disable-next-line no-console -- ruling: web-console-diagnostics: the handler above forwards only the message to the banner; the Error object here keeps the stack for a dev.
    // react-doctor-disable-next-line eslint/no-console -- ruling: web-console-diagnostics: the handler above forwards only the message to the banner; the Error object here keeps the stack for a dev.
    console.error('[local-db] Failed to persist database snapshot:', error);
  }
}

/**
 * Re-syncs the in-memory database after another tab committed a snapshot.
 * Returns the fresh handle, or null when there is nothing to sync. Callers
 * must replace any handle they were holding; the previous one stays usable for
 * one further sync generation (see openPersistentDatabase).
 */
async function syncLocalDbFromOtherTab(): Promise<AppDrizzleDb | null> {
  if (dbPromise === undefined) return null;
  const openedAt = generation;
  const session = await dbPromise;
  // A reset while this sync awaited closes the session; reviving it would leak
  // a live handle nothing owns.
  if (openedAt !== generation) return null;
  await session.syncFromStore();
  // Re-check: a reset can also land while syncFromStore was in flight.
  if (openedAt !== generation) return null;
  return session.db;
}

/** Invokes `onExternalChange` when another tab commits a snapshot. */
export function watchLocalDbForExternalChanges(
  onExternalChange: (db: AppDrizzleDb) => void,
): () => void {
  // Retired handles stay open for one generation (see openPersistentDatabase),
  // so syncing while hidden cannot break an in-flight query.
  const trySync = () => {
    void syncLocalDbFromOtherTab()
      .then((handle) => {
        if (handle !== null) onExternalChange(handle);
      })
      .catch((error: unknown) => {
        // A rejected store read must not become an unhandled rejection.
        // oxlint-disable-next-line no-console -- ruling: web-console-diagnostics: the cross-tab sync failure has no UI surface at all, so this is the only record that it happened.
        // react-doctor-disable-next-line eslint/no-console -- ruling: web-console-diagnostics: the cross-tab sync failure has no UI surface at all, so this is the only record that it happened.
        console.error('[local-db] Cross-tab sync failed:', error);
      });
  };
  const storageListener = (event: StorageEvent) => {
    if (event.key === SYNC_NOTIFY_KEY) trySync();
  };
  const visibilityListener = () => {
    if (document.visibilityState === 'visible') trySync();
  };
  window.addEventListener('storage', storageListener);
  document.addEventListener('visibilitychange', visibilityListener);
  return () => {
    window.removeEventListener('storage', storageListener);
    document.removeEventListener('visibilitychange', visibilityListener);
  };
}

/** Coalesces same-turn mutations; don't leave the snapshot to an unload callback. */
function scheduleLocalDbFlush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLocalDb();
  }, 0);
}
