import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  LoadingState,
  SettingsSection,
  PageContainer,
  PageHeader,
} from '@app/design-system';
import { formatCacheBytes } from '@app/cache';
import type { DownloadStatus } from '@app/db';
import type { PlatformCapabilities } from '@app/platform';
import { useState } from 'react';

import { formatStorageBytes } from '../format-storage-bytes.js';
import type { StorageClearTarget, StorageSummary } from '../types.js';

export interface StoragePageProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isRefreshing?: boolean;
  readonly isClearing?: boolean;
  readonly isRequestingPersist?: boolean;
  readonly isDownloadActionPending?: boolean;
  readonly summary: StorageSummary | null;
  readonly capabilities: PlatformCapabilities;
  readonly lastActionMessage?: string | null;
  readonly lastActionError?: string | null;
  onRefresh: () => void;
  onClear: (target: StorageClearTarget) => void;
  onRequestPersistentStorage: () => void;
  onRetryDownload: (chapterId: string) => void;
  onRemoveDownload: (chapterId: string) => void;
  onDismissActionStatus: () => void;
}

const DOWNLOAD_STATUS_LABEL: Record<DownloadStatus, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  complete: 'Downloaded',
  failed: 'Failed',
  partial: 'Partial',
  cancelled: 'Paused',
};

function downloadStatusText(item: StorageSummary['downloads']['items'][number]): string {
  const label = DOWNLOAD_STATUS_LABEL[item.status];
  if (item.status === 'downloading' || item.status === 'partial') {
    return `${label} ${item.completedPages}/${item.pageCount}`;
  }
  if (item.status === 'failed' && item.failedPages > 0) {
    return `${label} · ${item.failedPages} page${item.failedPages === 1 ? '' : 's'} missing`;
  }
  return label;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}

function ActionStatus({
  lastActionMessage,
  lastActionError,
  onDismissActionStatus,
}: {
  lastActionMessage: string | null;
  lastActionError: string | null;
  onDismissActionStatus: () => void;
}) {
  return (
    <>
      {lastActionMessage ? (
        <Alert>
          <AlertTitle>Storage updated</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{lastActionMessage}</span>
            <Button variant="ghost" size="sm" onClick={onDismissActionStatus}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {lastActionError ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{lastActionError}</span>
            <Button variant="ghost" size="sm" onClick={onDismissActionStatus}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

const CLEAR_COPY: Record<StorageClearTarget, { label: string; description: string }> = {
  provider_cache: {
    label: 'Clear provider cache',
    description:
      'Removes cached chapter metadata and cached image data from local storage. Downloads are kept, along with your library, reading progress, and installed providers.',
  },
  search_history: {
    label: 'Clear search history',
    description: 'Removes recent search queries from local history. Saved searches are kept.',
  },
};

function ClearDialog({
  target,
  isClearing,
  onCancel,
  onConfirm,
}: {
  target: StorageClearTarget | null;
  isClearing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        {target !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{CLEAR_COPY[target].label}</DialogTitle>
              <DialogDescription>{CLEAR_COPY[target].description}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={isClearing} onClick={onConfirm}>
                {isClearing ? 'Clearing…' : 'Clear'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DownloadsSection({
  summary,
  isPending,
  onRetryDownload,
  onRemoveDownload,
}: {
  readonly summary: StorageSummary;
  readonly isPending: boolean;
  onRetryDownload: (chapterId: string) => void;
  onRemoveDownload: (chapterId: string) => void;
}) {
  const { downloads } = summary;

  return (
    <SettingsSection
      title="Downloads"
      description="Chapters saved for offline reading. Downloads are never removed automatically, even when the cache limit is reached."
    >
      <dl className="divide-y divide-border">
        <InfoRow label="Downloaded chapters" value={String(downloads.count)} />
        <InfoRow label="Download size" value={formatCacheBytes(downloads.bytes)} />
      </dl>

      {downloads.items.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-label="Downloaded chapters">
          {downloads.items.map((item) => (
            <li
              key={item.chapterId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-muted/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.mangaTitle === undefined ? null : `${item.mangaTitle} · `}
                  {downloadStatusText(item)} · {formatCacheBytes(item.bytes)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.status === 'failed' ||
                item.status === 'partial' ||
                item.status === 'cancelled' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    aria-label={`Retry download: ${item.title}`}
                    onClick={() => onRetryDownload(item.chapterId)}
                  >
                    Retry
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  aria-label={`Remove download: ${item.title}`}
                  onClick={() => onRemoveDownload(item.chapterId)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No downloads yet. Download a chapter from its title to read it offline.
        </p>
      )}
    </SettingsSection>
  );
}

const STORAGE_DESCRIPTION =
  'Review local storage usage and clear safe cache data without touching your library or reading progress.';

export function StoragePage({
  isLoading,
  isError,
  isRefreshing = false,
  isClearing = false,
  isRequestingPersist = false,
  isDownloadActionPending = false,
  summary,
  capabilities,
  lastActionMessage = null,
  lastActionError = null,
  onRefresh,
  onClear,
  onRequestPersistentStorage,
  onRetryDownload,
  onRemoveDownload,
  onDismissActionStatus,
}: StoragePageProps) {
  const [pendingClear, setPendingClear] = useState<StorageClearTarget | null>(null);

  if (isLoading) {
    return (
      <PageContainer variant="read">
        <section aria-label="Storage" className="space-y-6">
          <PageHeader
            title="Storage"
            description={STORAGE_DESCRIPTION}
            actions={<Button disabled>Refresh storage</Button>}
          />
          <LoadingState type="sections" count={3} />
        </section>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer variant="read">
        <section aria-label="Storage">
          <ErrorState
            title="Could not load storage details"
            message="Local database or platform storage information is unavailable. Try reloading the page."
          />
        </section>
      </PageContainer>
    );
  }

  if (summary === null) {
    return (
      <PageContainer variant="read">
        <section aria-label="Storage">
          <ErrorState title="Storage unavailable" message="No storage summary was generated." />
        </section>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="read">
      <section aria-label="Storage" className="space-y-6">
        <PageHeader
          title="Storage"
          description={STORAGE_DESCRIPTION}
          actions={
            <Button onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Refresh storage'}
            </Button>
          }
        />

        <ActionStatus
          lastActionMessage={lastActionMessage}
          lastActionError={lastActionError}
          onDismissActionStatus={onDismissActionStatus}
        />

        <SettingsSection
          title="Browser storage"
          description="Quota and usage reported by the active platform adapter."
        >
          {summary.platformEstimate === null ? (
            <p className="text-sm text-muted-foreground">
              Storage estimates are not available on this runtime.
            </p>
          ) : (
            <dl className="divide-y divide-border">
              <InfoRow label="Quota" value={formatStorageBytes(summary.platformEstimate.quota)} />
              <InfoRow label="Usage" value={formatStorageBytes(summary.platformEstimate.usage)} />
              <InfoRow
                label="Persisted"
                value={summary.platformEstimate.persisted === true ? 'yes' : 'no'}
              />
            </dl>
          )}

          {capabilities.storageEstimate ? (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={onRequestPersistentStorage}
                disabled={isRequestingPersist}
              >
                {isRequestingPersist ? 'Requesting…' : 'Request persistent storage'}
              </Button>
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection
          title="Provider cache"
          description="Local records of cached chapters and images. Clearing this does not remove library entries or downloads."
        >
          <dl className="divide-y divide-border">
            <InfoRow label="Cache entries" value={String(summary.cacheEntryCount)} />
            <InfoRow label="Cached image data" value={formatCacheBytes(summary.cacheTotalBytes)} />
            <InfoRow
              label="Reclaimable cache"
              value={formatCacheBytes(summary.cacheEvictableBytes)}
            />
            <InfoRow
              label="Protected downloads"
              value={formatCacheBytes(summary.downloads.bytes)}
            />
          </dl>

          {summary.cacheByProvider.length > 0 ? (
            <ul className="mt-4 space-y-2" aria-label="Cache entries by provider">
              {summary.cacheByProvider.map((entry) => (
                <li
                  key={entry.providerId}
                  className="flex items-center justify-between rounded-control bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-foreground">{entry.providerId}</span>
                  <Badge variant="secondary">{entry.count}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No provider cache metadata stored yet.
            </p>
          )}

          <div className="mt-4">
            <Button
              variant="destructive"
              onClick={() => setPendingClear('provider_cache')}
              disabled={summary.cacheEntryCount === 0 || isClearing}
            >
              Clear provider cache
            </Button>
          </div>
        </SettingsSection>

        <DownloadsSection
          summary={summary}
          isPending={isDownloadActionPending}
          onRetryDownload={onRetryDownload}
          onRemoveDownload={onRemoveDownload}
        />

        <SettingsSection
          title="Search data"
          description="Recent queries and saved searches stored locally."
        >
          <dl className="divide-y divide-border">
            <InfoRow label="Search history" value={String(summary.searchHistoryCount)} />
            <InfoRow label="Saved searches" value={String(summary.savedSearchCount)} />
          </dl>

          <div className="mt-4">
            <Button
              variant="destructive"
              onClick={() => setPendingClear('search_history')}
              disabled={summary.searchHistoryCount === 0 || isClearing}
            >
              Clear search history
            </Button>
          </div>
        </SettingsSection>

        <ClearDialog
          target={pendingClear}
          isClearing={isClearing}
          onCancel={() => setPendingClear(null)}
          onConfirm={() => {
            if (pendingClear === null) return;
            onClear(pendingClear);
            setPendingClear(null);
          }}
        />
      </section>
    </PageContainer>
  );
}
