import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import type { AppDrizzleDb } from '@app/db';
import { getLocalDb } from '../lib/local-db.js';

export type LocalDbStatus = 'loading' | 'ready' | 'error';

interface LocalDbContextValue {
  readonly status: LocalDbStatus;
  readonly db: AppDrizzleDb | null;
}

const LocalDbContext = createContext<LocalDbContextValue>({
  status: 'loading',
  db: null,
});

export function LocalDbProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<LocalDbContextValue>({ status: 'loading', db: null });

  useEffect(() => {
    let cancelled = false;
    void getLocalDb()
      .then((handle) => {
        if (!cancelled) {
          setValue({ status: 'ready', db: handle });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValue({ status: 'error', db: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <LocalDbContext value={value}>{children}</LocalDbContext>;
}

export function useLocalDb(): AppDrizzleDb | null {
  const { status, db } = use(LocalDbContext);
  return status === 'ready' ? db : null;
}

export function useLocalDbStatus(): LocalDbStatus {
  return use(LocalDbContext).status;
}
