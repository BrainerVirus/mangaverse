import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppDrizzleDb } from '@app/db';
import { seedDevMangaDexProvider } from '../lib/dev-seed-mangadex.js';
import {
  flushLocalDb,
  getLocalDb,
  resetLocalDb,
  watchLocalDbForExternalChanges,
} from '../lib/local-db.js';

export type LocalDbStatus = 'loading' | 'ready' | 'error';

interface LocalDbContextValue {
  readonly status: LocalDbStatus;
  readonly db: AppDrizzleDb | null;
  readonly errorMessage: string | null;
  readonly retry: () => void;
}

const LocalDbContext = createContext<LocalDbContextValue>({
  status: 'loading',
  db: null,
  errorMessage: null,
  retry: () => {},
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
  const [value, setValue] = useState<Omit<LocalDbContextValue, 'retry'>>({
    status: 'loading',
    db: null,
    errorMessage: null,
  });
  const [attempt, setAttempt] = useState(0);
  const [handleVersion, setHandleVersion] = useState(0);
  const queryClient = useQueryClient();

  const retry = useCallback(() => {
    resetLocalDb();
    setValue({ status: 'loading', db: null, errorMessage: null });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getLocalDb()
      .then(async (handle) => {
        if (import.meta.env.DEV) {
          try {
            await seedDevMangaDexProvider(handle);
          } catch (seedError) {
            console.warn('[LocalDbProvider] Dev MangaDex seed skipped:', seedError);
          }
        }

        if (!cancelled) {
          setValue({ status: 'ready', db: handle, errorMessage: null });
        }
      })
      .catch((error: unknown) => {
        logDbInitFailure(error);
        if (!cancelled) {
          setValue({
            status: 'error',
            db: null,
            errorMessage: formatDbError(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (value.status !== 'ready') return;

    const unsubscribe = watchLocalDbForExternalChanges((handle) => {
      // Replace the handle on the next render; invalidation happens in the
      // effect below so observers refetch with the fresh handle.
      setValue({ status: 'ready', db: handle, errorMessage: null });
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
    <LocalDbContext value={{ ...value, retry }}>{children}</LocalDbContext>
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
