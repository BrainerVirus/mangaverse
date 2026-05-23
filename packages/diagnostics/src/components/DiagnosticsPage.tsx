import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ErrorState,
  LoadingState,
  SettingsSection,
} from '@app/design-system';
import type { PlatformCapabilities } from '@app/platform';
import { useMemo, useState } from 'react';

import { formatDiagnosticsReport, formatStorageBytes } from '../format-diagnostics-report.js';
import type { DiagnosticsReport } from '../types.js';

export interface DiagnosticsPageProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isRefreshing?: boolean;
  readonly report: DiagnosticsReport | null;
  readonly capabilities: PlatformCapabilities;
  onRefresh: () => void;
  onCopyReport: (text: string) => void | Promise<void>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}

function CapabilityGrid({ capabilities }: { capabilities: PlatformCapabilities }) {
  const entries = useMemo(() => {
    const { runtime: _runtime, ...flags } = capabilities;
    return Object.entries(flags).sort(([left], [right]) => left.localeCompare(right));
  }, [capabilities]);

  return (
    <dl className="grid gap-2 sm:grid-cols-2" aria-label="Platform capabilities">
      {entries.map(([key, enabled]) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-sm"
        >
          <dt className="text-muted-foreground">{key}</dt>
          <dd>
            <Badge variant={enabled ? 'secondary' : 'outline'}>{enabled ? 'yes' : 'no'}</Badge>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DiagnosticsPage({
  isLoading,
  isError,
  isRefreshing = false,
  report,
  capabilities,
  onRefresh,
  onCopyReport,
}: DiagnosticsPageProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

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
          title="Could not load diagnostics"
          message="Local database or platform information is unavailable. Try reloading the page."
        />
      </main>
    );
  }

  if (report === null) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <ErrorState title="Diagnostics unavailable" message="No report was generated." />
      </main>
    );
  }

  const formattedReport = formatDiagnosticsReport(report);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          About MangaVerse, platform details, storage usage, and local database health for troubleshooting.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing…' : 'Refresh diagnostics'}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void Promise.resolve(onCopyReport(formattedReport))
              .then(() => setCopyState('copied'))
              .catch(() => setCopyState('failed'));
          }}
        >
          Copy report
        </Button>
        {copyState === 'copied' ? (
          <span className="text-sm text-muted-foreground" role="status">
            Copied to clipboard
          </span>
        ) : null}
        {copyState === 'failed' ? (
          <span className="text-sm text-destructive" role="status">
            Could not copy report
          </span>
        ) : null}
      </div>

      <SettingsSection title="About" description="Application identity and build information.">
        <dl className="divide-y divide-[var(--border)]">
          <InfoRow label="App" value={report.appName} />
          <InfoRow label="Version" value={report.appVersion} />
          <InfoRow label="Runtime" value={report.runtime} />
          <InfoRow label="Generated" value={report.generatedAt} />
        </dl>
      </SettingsSection>

      <SettingsSection title="Platform" description="Environment snapshot from the active platform adapter.">
        <dl className="divide-y divide-[var(--border)]">
          {report.platformSnapshot.platform !== undefined ? (
            <InfoRow label="Platform" value={String(report.platformSnapshot.platform)} />
          ) : null}
          {report.platformSnapshot.arch !== undefined ? (
            <InfoRow label="Architecture" value={report.platformSnapshot.arch} />
          ) : null}
          {report.platformSnapshot.electronVersion !== undefined ? (
            <InfoRow label="Electron" value={report.platformSnapshot.electronVersion} />
          ) : null}
          {report.platformSnapshot.chromeVersion !== undefined ? (
            <InfoRow label="Chrome" value={report.platformSnapshot.chromeVersion} />
          ) : null}
          {report.platformSnapshot.nodeVersion !== undefined ? (
            <InfoRow label="Node" value={report.platformSnapshot.nodeVersion} />
          ) : null}
          {report.platformSnapshot.userDataConfigured !== undefined ? (
            <InfoRow
              label="User data path"
              value={report.platformSnapshot.userDataConfigured ? 'configured' : 'not configured'}
            />
          ) : null}
        </dl>
      </SettingsSection>

      <SettingsSection title="Capabilities" description="Features available on this device and runtime.">
        <CapabilityGrid capabilities={capabilities} />
      </SettingsSection>

      <SettingsSection title="Storage" description="Browser or desktop storage estimates when available.">
        {report.storageEstimate === null ? (
          <p className="text-sm text-muted-foreground">Storage estimates are not available on this runtime.</p>
        ) : (
          <dl className="divide-y divide-[var(--border)]">
            <InfoRow label="Quota" value={formatStorageBytes(report.storageEstimate.quota)} />
            <InfoRow label="Usage" value={formatStorageBytes(report.storageEstimate.usage)} />
            <InfoRow
              label="Persisted"
              value={report.storageEstimate.persisted === true ? 'yes' : 'no'}
            />
          </dl>
        )}
      </SettingsSection>

      <SettingsSection title="Local database" description="Counts from your on-device SQLite library.">
        {!report.localDatabaseReady || report.localData === null ? (
          <Alert variant="destructive">
            <AlertTitle>Database unavailable</AlertTitle>
            <AlertDescription>Local SQLite is not ready. Library counts cannot be collected.</AlertDescription>
          </Alert>
        ) : (
          <dl className="divide-y divide-[var(--border)]">
            <InfoRow label="Library entries" value={String(report.localData.libraryEntryCount)} />
            <InfoRow label="Manga identities" value={String(report.localData.mangaIdentityCount)} />
            <InfoRow label="Installed extensions" value={String(report.localData.installedExtensionCount)} />
            <InfoRow label="Enabled extensions" value={String(report.localData.enabledExtensionCount)} />
            <InfoRow label="Broken extensions" value={String(report.localData.brokenExtensionCount)} />
            <InfoRow label="Categories" value={String(report.localData.categoryCount)} />
            <InfoRow label="Provider settings" value={String(report.localData.providerSettingsCount)} />
          </dl>
        )}
      </SettingsSection>

      {report.localService !== null ? (
        <SettingsSection title="Local service" description="Desktop-only helper service status.">
          <dl className="divide-y divide-[var(--border)]">
            <InfoRow label="Running" value={report.localService.running ? 'yes' : 'no'} />
            <InfoRow label="Host" value={report.localService.host ?? 'n/a'} />
            <InfoRow label="Port" value={report.localService.port !== null ? String(report.localService.port) : 'n/a'} />
          </dl>
        </SettingsSection>
      ) : null}
    </main>
  );
}
