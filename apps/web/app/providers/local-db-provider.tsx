import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
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
}

const LocalDbContext = createContext<LocalDbContextValue>({
  status: 'loading',
  db: null,
  errorMessage: null,
  persistenceError: null,
  retry: () => {},
  retryPersistence: () => {},
});

function formatDbError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function logDbInitFailure(error: unknown): void {
  const message = formatDbError(error);
  console.error('[LocalDbProvider] Failed to initialize local database:', message, error);
}

export function LocalDbProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Omit<LocalDbContextValue, 'retry' | 'retryPersistence'>>({
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

  useEffect(() => {
    let cancelled = false;

    void getLocalDb()
      .then(async (handle) => {
        try {
          await installFirstPartyProviders(handle);
        } catch (seedError) {
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

  useEffect(() => {
    setPersistenceErrorHandler((message) => {
      setValue((current) => ({ ...current, persistenceError: message }));
    });
    return () => {
      setPersistenceErrorHandler(null);
    };
  }, []);

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

  useEffect(() => {
    if (value.status !== 'ready' || handleVersion === 0) return;
    void queryClient.invalidateQueries();
  }, [handleVersion, queryClient, value.status]);

  return (
    <LocalDbContext value={{ ...value, retry, retryPersistence }}>{children}</LocalDbContext>
  );
}

export function useLocalDb(): AppDrizzleDb | null {
  const { status, db } = use(LocalDbContext);
  return status === 'ready' ? db : null;
}

export function useLocalDbStatus(): LocalDbStatus {
  return use(LocalDbContext).status;
}

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
