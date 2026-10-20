import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppDrizzleDb } from '@app/db';
import { installFirstPartyProviders } from '../lib/first-party-providers.js';
import {
  flushLocalDb,
  getLocalDb,
  resetLocalDb,
  setPersistenceErrorHandler,
  watchLocalDbForExternalChanges,
} from '../lib/local-db.js';

export type LocalDbStatus = 'loading' | 'ready' | 'error';

interface LocalDbContextValue {
  readonly status: LocalDbStatus;
  readonly db: AppDrizzleDb | null;
  readonly errorMessage: string | null;
  /** Last durable-write failure, surfaced by the shell banner. */
  readonly persistenceError: string | null;
  readonly retry: () => void;
  readonly retryPersistence: () => void;
  /** Reports a durable-write failure from a caller outside the flush path. */
  readonly reportPersistenceError: (message: string) => void;
}

const LocalDbContext = createContext<LocalDbContextValue>({
  status: 'loading',
  db: null,
  errorMessage: null,
  persistenceError: null,
  retry: () => {},
  retryPersistence: () => {},
  reportPersistenceError: () => {},
});

function formatDbError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function logDbInitFailure(error: unknown): void {
  const message = formatDbError(error);
  // oxlint-disable-next-line no-console -- ruling: web-console-diagnostics: this sink carries the Error object (stack + cause) that the `errorMessage` state below cannot; without it a dev has nothing to inspect when the DB fails to open. No logger dependency is in scope.
  // react-doctor-disable-next-line eslint/no-console -- ruling: web-console-diagnostics: this sink carries the Error object (stack + cause) that the `errorMessage` state below cannot; without it a dev has nothing to inspect when the DB fails to open. No logger dependency is in scope.
  console.error('[LocalDbProvider] Failed to initialize local database:', message, error);
}

export function LocalDbProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<
    Omit<LocalDbContextValue, 'retry' | 'retryPersistence' | 'reportPersistenceError'>
  >({
    status: 'loading',
    db: null,
    errorMessage: null,
    persistenceError: null,
  });
  const [attempt, setAttempt] = useState(0);
  const [handleVersion, setHandleVersion] = useState(0);
  const queryClient = useQueryClient();

  const retry = useCallback(() => {
    resetLocalDb();
    setValue({ status: 'loading', db: null, errorMessage: null, persistenceError: null });
    setAttempt((current) => current + 1);
  }, []);

  const retryPersistence = useCallback(() => {
    setValue((current) => ({ ...current, persistenceError: null }));
    void flushLocalDb();
  }, []);

  const reportPersistenceError = useCallback((message: string) => {
    setValue((current) => ({ ...current, persistenceError: message }));
  }, []);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-db-open: opening the IndexedDB/WASM session is a true external-system boundary with an async result; only an effect can start it per `attempt` and cancel on unmount.
  useEffect(() => {
    let cancelled = false;

    void getLocalDb()
      .then(async (handle) => {
        try {
          await installFirstPartyProviders(handle);
        } catch (seedError) {
          // oxlint-disable-next-line no-console -- ruling: web-console-diagnostics: a skipped seed is non-fatal and never reaches `errorMessage` or the UI, so this warn is the only signal that a bundled provider is missing.
          // react-doctor-disable-next-line eslint/no-console -- ruling: web-console-diagnostics: a skipped seed is non-fatal and never reaches `errorMessage` or the UI, so this warn is the only signal that a bundled provider is missing.
          console.warn('[LocalDbProvider] First-party provider install skipped:', seedError);
        }

        if (!cancelled) {
          setValue((current) => ({ ...current, status: 'ready', db: handle, errorMessage: null }));
        }
      })
      .catch((error: unknown) => {
        logDbInitFailure(error);
        if (!cancelled) {
          setValue((current) => ({
            ...current,
            status: 'error',
            db: null,
            errorMessage: formatDbError(error),
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-sink-registration: `setPersistenceErrorHandler` is a module-level sink in the local-db lib; registering and clearing it is subscription bookkeeping, not derivable state.
  useEffect(() => {
    setPersistenceErrorHandler((message) => {
      setValue((current) => ({ ...current, persistenceError: message }));
    });
    return () => {
      setPersistenceErrorHandler(null);
    };
  }, []);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-external-subscriptions: subscribes to the browser's storage/visibilitychange events and the pagehide flush.
  useEffect(() => {
    if (value.status !== 'ready') return;

    const unsubscribe = watchLocalDbForExternalChanges((handle) => {
      // Replace the handle on the next render; invalidation happens in the
      // effect below so observers refetch with the fresh handle.
      setValue((current) => ({ ...current, status: 'ready', db: handle, errorMessage: null }));
      setHandleVersion((version) => version + 1);
    });

    const handlePageHide = () => {
      void flushLocalDb();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', handlePageHide);
      // Best-effort final flush; committed writes already flushed after mutation.
      void flushLocalDb();
    };
  }, [value.status]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-query-cache-sync: the cross-tab snapshot handler swaps the handle; invalidating here (after the commit that closes over the new handle) is what makes observers refetch against it.
  useEffect(() => {
    if (value.status !== 'ready' || handleVersion === 0) return;
    void queryClient.invalidateQueries();
  }, [handleVersion, queryClient, value.status]);

  const contextValue = useMemo<LocalDbContextValue>(
    () => ({ ...value, retry, retryPersistence, reportPersistenceError }),
    [value, retry, retryPersistence, reportPersistenceError],
  );

  return <LocalDbContext value={contextValue}>{children}</LocalDbContext>;
}

export function useLocalDb(): AppDrizzleDb | null {
  const { status, db } = use(LocalDbContext);
  return status === 'ready' ? db : null;
}

export function useLocalDbStatus(): LocalDbStatus {
  return use(LocalDbContext).status;
}

/** Formatted failure from the last attempt to open the local database. */
export function useLocalDbError(): string | null {
  return use(LocalDbContext).errorMessage;
}

export function useLocalDbRetry(): () => void {
  return use(LocalDbContext).retry;
}

export function usePersistenceError(): string | null {
  return use(LocalDbContext).persistenceError;
}

export function useRetryPersistence(): () => void {
  return use(LocalDbContext).retryPersistence;
}

export function useReportPersistenceError(): (message: string) => void {
  return use(LocalDbContext).reportPersistenceError;
}
