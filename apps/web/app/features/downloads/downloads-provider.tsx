import { createContext, use, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { notify } from '@app/design-system';
import type { ChapterId } from '@app/shared';

import { createAppPlatformAdapter } from '@/features/diagnostics/index.js';
import { storageQueryKeys } from '@/features/storage/query-keys.js';
import { useLocalDb, useLocalDbStatus } from '../../providers/local-db-provider.js';
import {
  createDownloadEngine,
  type DownloadEngine,
  type DownloadEngineSnapshot,
} from './download-engine.js';
import { loadDownloadChapter, readDownloadChapter } from './load-chapter.js';
import { downloadsQueryKeys } from './query-keys.js';
import type { DownloadProgress } from './types.js';

const DownloadsContext = createContext<DownloadEngine | null>(null);

const noopSubscribe = (): (() => void) => () => {};
const noSnapshot = (): DownloadEngineSnapshot | null => null;

interface DownloadsProviderProps {
  readonly children: ReactNode;
}

/**
 * One engine per window. It resumes queued and interrupted rows when the first
 * component subscribes, which is why the store is driven through `useSyncExternalStore`
 * rather than an effect.
 */
function DownloadRuntime({ engine }: { readonly engine: DownloadEngine | null }) {
  // Bind the store's methods once per engine: a new subscribe function every render
  // would make React tear down and re-subscribe on each paint.
  const store = useMemo(
    () =>
      engine === null
        ? null
        : {
            subscribe: (listener: () => void) => engine.subscribe(listener),
            getSnapshot: () => engine.getSnapshot(),
          },
    [engine],
  );
  useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? noSnapshot,
    noSnapshot,
  );
  return null;
}

export function DownloadsProvider({ children }: DownloadsProviderProps) {
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const adapter = useMemo(() => createAppPlatformAdapter(), []);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const engine = useMemo(() => {
    if (dbStatus !== 'ready' || db === null) return null;
    return createDownloadEngine({
      db,
      adapter,
      readChapter: (chapterId) => readDownloadChapter(db, chapterId),
      loadChapter: (chapterId, signal) => loadDownloadChapter(db, chapterId, signal),
      onChanged: () => {
        void queryClient.invalidateQueries({ queryKey: downloadsQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: storageQueryKeys.summary() });
      },
      onStorageFull: (download) => {
        notify.failure({
          key: 'download-storage-full',
          message: `The device is out of storage, so “${download.chapterId}” stopped downloading. Pages already saved were kept.`,
          action: {
            label: 'Manage storage',
            onClick: () => void navigate({ to: '/storage' }),
          },
        });
      },
    });
  }, [adapter, db, dbStatus, navigate, queryClient]);

  return (
    <DownloadsContext value={engine}>
      <DownloadRuntime engine={engine} />
      {children}
    </DownloadsContext>
  );
}

export function useDownloadEngine(): DownloadEngine | null {
  return use(DownloadsContext);
}

/** The live progress of the chapter currently downloading, or null. */
export function useDownloadProgress(): DownloadProgress | null {
  const engine = useDownloadEngine();
  const store = useMemo(
    () =>
      engine === null
        ? null
        : {
            subscribe: (listener: () => void) => engine.subscribe(listener),
            getSnapshot: () => engine.getSnapshot(),
          },
    [engine],
  );
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? noSnapshot,
    noSnapshot,
  );
  if (snapshot === null || snapshot.active === null) return null;
  return {
    chapterId: snapshot.active.chapterId as ChapterId,
    completedPages: snapshot.active.completedPages,
    pageCount: snapshot.active.pageCount,
  };
}
