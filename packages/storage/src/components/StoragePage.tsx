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
} from '@app/design-system';
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
  readonly summary: StorageSummary | null;
  readonly capabilities: PlatformCapabilities;
  readonly lastActionMessage?: string | null;
  readonly lastActionError?: string | null;
  onRefresh: () => void;
  onClear: (target: StorageClearTarget) => void;
  onRequestPersistentStorage: () => void;
  onDismissActionStatus: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}

export function StoragePage({
  isLoading,
  isError,
  isRefreshing = false,
  isClearing = false,
  isRequestingPersist = false,
  summary,
  capabilities,
  lastActionMessage = null,
  lastActionError = null,
  onRefresh,
  onClear,
  onRequestPersistentStorage,
  onDismissActionStatus,
}: StoragePageProps) {
  const [pendingClear, setPendingClear] = useState<StorageClearTarget | null>(null);

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load storage details"
          message="Local database or platform storage information is unavailable. Try reloading the page."
        />
      </main>
    );
  }

  if (summary === null) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <ErrorState title="Storage unavailable" message="No storage summary was generated." />
      </main>
    );
  }

  const clearLabel =
    pendingClear === 'provider_cache'
      ? 'Clear provider cache metadata'
      : pendingClear === 'search_history'
        ? 'Clear search history'
        : '';

  const clearDescription =
    pendingClear === 'provider_cache'
      ? 'Removes cached chapter metadata tracked in your local database. Your library, reading progress, and installed providers are kept.'
      : pendingClear === 'search_history'
        ? 'Removes recent search queries from local history. Saved searches are kept.'
        : '';

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Storage</h1>
        <p className="text-sm text-muted-foreground">
          Review local storage usage and clear safe cache data without touching your library or reading progress.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing…' : 'Refresh storage'}
        </Button>
      </div>

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

      <SettingsSection
        title="Browser storage"
        description="Quota and usage reported by the active platform adapter."
      >
        {summary.platformEstimate === null ? (
          <p className="text-sm text-muted-foreground">
            Storage estimates are not available on this runtime.
          </p>
        ) : (
          <dl className="divide-y divide-[var(--border)]">
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
        title="Provider cache metadata"
        description="Local records of cached chapters and images. Clearing this does not remove library entries."
      >
        <dl className="divide-y divide-[var(--border)]">
          <InfoRow label="Cache entries" value={String(summary.cacheEntryCount)} />
        </dl>

        {summary.cacheByProvider.length > 0 ? (
          <ul className="mt-4 space-y-2" aria-label="Cache entries by provider">
            {summary.cacheByProvider.map((entry) => (
              <li
                key={entry.providerId}
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="font-mono text-foreground">{entry.providerId}</span>
                <Badge variant="secondary">{entry.count}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No provider cache metadata stored yet.</p>
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

      <SettingsSection
        title="Search data"
        description="Recent queries and saved searches stored locally."
      >
        <dl className="divide-y divide-[var(--border)]">
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

      {pendingClear !== null ? (
        <Dialog role="dialog" aria-modal="true" aria-labelledby="storage-clear-title">
          <DialogContent>
            <DialogHeader>
              <DialogTitle id="storage-clear-title">{clearLabel}</DialogTitle>
              <DialogDescription>{clearDescription}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setPendingClear(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={isClearing}
                onClick={() => {
                  if (pendingClear === null) {
                    return;
                  }
                  onClear(pendingClear);
                  setPendingClear(null);
                }}
              >
                {isClearing ? 'Clearing…' : 'Clear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </main>
  );
}
