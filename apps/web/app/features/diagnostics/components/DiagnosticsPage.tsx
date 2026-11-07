import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ErrorState,
  LoadingState,
  SettingsSection,
  PageHeader,
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
          className="flex items-center justify-between rounded-control bg-muted/40 px-3 py-2 text-sm"
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

function PlatformSection({ report }: { report: DiagnosticsReport }) {
  return (
    <SettingsSection
      title="Platform"
      description="Environment snapshot from the active platform adapter."
    >
      <dl className="divide-y divide-border">
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
  );
}

function StorageSection({ report }: { report: DiagnosticsReport }) {
  return (
    <SettingsSection
      title="Storage"
      description="Browser or desktop storage estimates when available."
    >
      {report.storageEstimate === null ? (
        <p className="text-sm text-muted-foreground">
          Storage estimates are not available on this runtime.
        </p>
      ) : (
        <dl className="divide-y divide-border">
          <InfoRow label="Quota" value={formatStorageBytes(report.storageEstimate.quota)} />
          <InfoRow label="Usage" value={formatStorageBytes(report.storageEstimate.usage)} />
          <InfoRow
            label="Persisted"
            value={report.storageEstimate.persisted === true ? 'yes' : 'no'}
          />
        </dl>
      )}
    </SettingsSection>
  );
}

function LocalDatabaseSection({ report }: { report: DiagnosticsReport }) {
  if (!report.localDatabaseReady || report.localData === null) {
    return (
      <SettingsSection
        title="Local database"
        description="Counts from your on-device SQLite library."
      >
        <Alert variant="destructive">
          <AlertTitle>Database unavailable</AlertTitle>
          <AlertDescription>
            Local SQLite is not ready. Library counts cannot be collected.
          </AlertDescription>
        </Alert>
      </SettingsSection>
    );
  }

  const localData = report.localData;
  return (
    <SettingsSection
      title="Local database"
      description="Counts from your on-device SQLite library."
    >
      <dl className="divide-y divide-border">
        <InfoRow label="Library entries" value={String(localData.libraryEntryCount)} />
        <InfoRow label="Manga identities" value={String(localData.mangaIdentityCount)} />
        <InfoRow label="Installed extensions" value={String(localData.installedExtensionCount)} />
        <InfoRow label="Enabled extensions" value={String(localData.enabledExtensionCount)} />
        <InfoRow label="Broken extensions" value={String(localData.brokenExtensionCount)} />
        <InfoRow label="Categories" value={String(localData.categoryCount)} />
        <InfoRow label="Provider settings" value={String(localData.providerSettingsCount)} />
        <InfoRow label="Extension log entries" value={String(localData.extensionLogCount)} />
        <InfoRow label="Extension errors logged" value={String(localData.extensionErrorLogCount)} />
      </dl>
    </SettingsSection>
  );
}

function LocalServiceSection({ report }: { report: DiagnosticsReport }) {
  if (report.localService === null) return null;

  return (
    <SettingsSection title="Local service" description="Desktop-only helper service status.">
      <dl className="divide-y divide-border">
        <InfoRow label="Running" value={report.localService.running ? 'yes' : 'no'} />
        <InfoRow label="Host" value={report.localService.host ?? 'n/a'} />
        <InfoRow
          label="Port"
          value={report.localService.port !== null ? String(report.localService.port) : 'n/a'}
        />
      </dl>
    </SettingsSection>
  );
}

const DIAGNOSTICS_DESCRIPTION =
  'About MangaVerse, platform details, storage usage, and local database health for troubleshooting.';

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

  if (isError) {
    return (
      <section aria-label="Diagnostics">
        <ErrorState
          title="Could not load diagnostics"
          message="Local database or platform information is unavailable. Try reloading the page."
        />
      </section>
    );
  }

  // No report and no error means the report is still being fetched. Rendering the error state
  // here painted a short page for the fetch window, so everything below it (the event log)
  // jumped into view and back out when the report arrived.
  if (isLoading || report === null) {
    return (
      <section aria-label="Diagnostics" className="space-y-6">
        <PageHeader
          title="Diagnostics"
          description={DIAGNOSTICS_DESCRIPTION}
          actions={
            <>
              <Button disabled>Refresh diagnostics</Button>
              <Button variant="outline" disabled>
                Copy report
              </Button>
            </>
          }
        />
        <LoadingState type="sections" count={3} />
      </section>
    );
  }

  const formattedReport = formatDiagnosticsReport(report);

  return (
    <section aria-label="Diagnostics" className="space-y-6">
      <PageHeader
        title="Diagnostics"
        description={DIAGNOSTICS_DESCRIPTION}
        actions={
          <>
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
              <output className="text-sm text-muted-foreground">Copied to clipboard</output>
            ) : null}
            {copyState === 'failed' ? (
              <output className="text-sm text-destructive">Could not copy report</output>
            ) : null}
          </>
        }
      />

      <SettingsSection title="About" description="Application identity and build information.">
        <dl className="divide-y divide-border">
          <InfoRow label="App" value={report.appName} />
          <InfoRow label="Version" value={report.appVersion} />
          <InfoRow label="Runtime" value={report.runtime} />
          <InfoRow label="Generated" value={report.generatedAt} />
        </dl>
      </SettingsSection>

      <PlatformSection report={report} />

      <SettingsSection
        title="Capabilities"
        description="Features available on this device and runtime."
      >
        <CapabilityGrid capabilities={capabilities} />
      </SettingsSection>

      <StorageSection report={report} />

      <LocalDatabaseSection report={report} />

      <LocalServiceSection report={report} />
    </section>
  );
}
