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
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
  Switch,
} from '@app/design-system';
import type {
  ExtensionLogCounts,
  ExtensionLogEntry,
  ExtensionLogLevel,
  ProviderHealthCheckReport,
  ProviderUpdateCheck,
} from '../core/index.js';
import type { ProviderSettingsValues } from '@app/shared';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { downloadJson } from '../download-json.js';
import type { ProviderDetailData } from '../types.js';
import { ProviderSettingsForm } from './ProviderSettingsForm.js';

export type ActivityLevelFilter = 'all' | ExtensionLogLevel;

export interface ProviderActivityState {
  readonly logs: readonly ExtensionLogEntry[] | null;
  readonly counts: ExtensionLogCounts;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly level: ActivityLevelFilter;
  readonly onLevelChange: (level: ActivityLevelFilter) => void;
  readonly onClear: () => void;
  readonly isClearing: boolean;
}

export interface ProviderHealthState {
  readonly report: ProviderHealthCheckReport | null;
  readonly isChecking: boolean;
  readonly error: string | null;
  readonly canRunNetworkCheck: boolean;
  readonly includeNetwork: boolean;
  readonly onIncludeNetworkChange: (enabled: boolean) => void;
  readonly onRun: () => void;
  readonly onCancel?: () => void;
  readonly lastCheckedAt: string | null;
}

export interface ProviderUpdateState {
  readonly check: ProviderUpdateCheck | null;
  readonly isChecking: boolean;
  readonly error: string | null;
  readonly onCheck: () => void;
  readonly onApply: () => void;
  readonly isApplying: boolean;
}

export interface ProviderDetailPageProps {
  providerId: string;
  data: ProviderDetailData | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onBack?: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onSaveSettings: (settings: ProviderSettingsValues) => void;
  onRemove: () => void;
  isUpdating?: boolean;
  isSavingSettings?: boolean;
  settingsSaved?: boolean;
  settingsError?: string | null;
  activity?: ProviderActivityState | undefined;
  health?: ProviderHealthState | undefined;
  update?: ProviderUpdateState | undefined;
}

function UninstallProviderDialog({
  open,
  onOpenChange,
  providerName,
  isUpdating,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  isUpdating: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Uninstall {providerName}?</DialogTitle>
          <DialogDescription>
            This removes the provider record and its saved settings from this device. Your library,
            manga entries, and reading progress stay. You can install the provider again from its
            manifest URL.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isUpdating}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {isUpdating ? 'Uninstalling…' : 'Uninstall provider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function healthBadgeVariant(
  health: ProviderDetailData['provider']['health'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (health === 'broken') return 'destructive';
  if (health === 'degraded') return 'outline';
  return 'secondary';
}

function backAction(onBack: (() => void) | undefined): {
  action?: { label: string; onClick: () => void };
} {
  return onBack === undefined ? {} : { action: { label: 'Back to extensions', onClick: onBack } };
}

function checkBadgeVariant(
  status: ProviderHealthCheckReport['checks'][number]['status'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'fail') return 'destructive';
  if (status === 'degraded') return 'outline';
  if (status === 'skipped') return 'outline';
  return 'secondary';
}

function reportBadgeVariant(
  status: ProviderHealthCheckReport['status'],
): 'secondary' | 'destructive' | 'outline' {
  if (status === 'broken') return 'destructive';
  if (status === 'degraded') return 'outline';
  return 'secondary';
}

function logBadgeVariant(level: ExtensionLogLevel): 'secondary' | 'outline' | 'destructive' {
  if (level === 'error') return 'destructive';
  if (level === 'warn') return 'outline';
  return 'secondary';
}

function HealthCheckSection({ health }: { health: ProviderHealthState }) {
  return (
    <SettingsSection
      title="Health check"
      description="Runs static checks on the install, runtime binding and declared capabilities. The optional network check runs the provider's search once and is off by default."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={health.onRun}
            disabled={health.isChecking}
          >
            {health.isChecking ? 'Checking…' : 'Run health check'}
          </Button>
          {health.isChecking && health.onCancel !== undefined ? (
            <Button type="button" variant="outline" onClick={health.onCancel}>
              Cancel
            </Button>
          ) : null}
          {health.canRunNetworkCheck ? (
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={health.includeNetwork}
                onCheckedChange={health.onIncludeNetworkChange}
                aria-label="Include network check (runs provider search)"
              />
              <span>Include network check (runs provider search)</span>
            </div>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          {health.lastCheckedAt === null
            ? 'No health check has run yet.'
            : `Last check: ${new Date(health.lastCheckedAt).toLocaleString()}`}
        </p>

        {health.error !== null ? (
          <Alert variant="destructive">
            <AlertTitle>Health check failed</AlertTitle>
            <AlertDescription>{health.error}</AlertDescription>
          </Alert>
        ) : null}

        {health.report !== null ? (
          <output aria-label="Health check results" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Overall</span>
              <Badge variant={reportBadgeVariant(health.report.status)}>
                {health.report.status}
              </Badge>
            </div>
            <ul className="flex flex-col gap-2">
              {health.report.checks.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 rounded-control bg-muted/40 p-3 sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="flex flex-col gap-1 sm:items-end">
                    <Badge variant={checkBadgeVariant(item.status)}>{item.status}</Badge>
                    {item.reason !== undefined ? (
                      <span className="text-sm text-muted-foreground">{item.reason}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </output>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function UpdateSection({
  data,
  update,
  confirmOpen,
  onConfirmOpenChange,
  providerName,
}: {
  data: ProviderDetailData;
  update: ProviderUpdateState;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  providerName: string;
}) {
  const hasManifestUrl = data.provider.manifestUrl !== undefined;
  const available = update.check?.remoteManifest;
  return (
    <SettingsSection
      title="Updates"
      description="Checks the recorded manifest URL; nothing is installed until you confirm."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={update.onCheck}
            disabled={update.isChecking || !hasManifestUrl}
          >
            {update.isChecking ? 'Checking…' : 'Check for updates'}
          </Button>
          {update.check?.status === 'available' ? (
            <Button type="button" onClick={() => onConfirmOpenChange(true)}>
              Update to v{update.check.remoteVersion}
            </Button>
          ) : null}
        </div>
        {!hasManifestUrl ? (
          <p className="text-sm text-muted-foreground">
            No manifest URL is recorded for this provider, so updates cannot be checked.
          </p>
        ) : null}
        {update.error !== null ? (
          <Alert variant="destructive">
            <AlertTitle>Update check failed</AlertTitle>
            <AlertDescription>{update.error}</AlertDescription>
          </Alert>
        ) : null}
        {update.check !== null ? (
          <output className="block text-sm text-muted-foreground">
            {update.check.message ?? `Update check: ${update.check.status}.`}
          </output>
        ) : (
          <p className="text-sm text-muted-foreground">No update check has run yet.</p>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={onConfirmOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Update {providerName} to v{available?.version}?
            </DialogTitle>
            <DialogDescription>
              The provider manifest is replaced with the validated remote manifest. Enabled state
              and saved settings stay as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onConfirmOpenChange(false)}
              disabled={update.isApplying}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onConfirmOpenChange(false);
                update.onApply();
              }}
              disabled={update.isApplying}
            >
              {update.isApplying ? 'Updating…' : 'Update provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

function levelCount(counts: ExtensionLogCounts, level: ActivityLevelFilter): number {
  if (level === 'all') return counts.total;
  if (level === 'error') return counts.errors;
  if (level === 'warn') return counts.warnings;
  return counts.info;
}

const ACTIVITY_LEVEL_LABEL: Record<ActivityLevelFilter, string> = {
  all: 'activity',
  info: 'info',
  warn: 'warnings',
  error: 'errors',
};

function ActivityEmptyMessage({
  level,
  retained,
}: {
  level: ActivityLevelFilter;
  retained: number;
}) {
  if (retained > 0) return null;
  return (
    <p className="text-sm text-muted-foreground">
      No {ACTIVITY_LEVEL_LABEL[level]} recorded for this provider.
    </p>
  );
}

function ActivitySection({
  providerId,
  activity,
}: {
  providerId: string;
  activity: ProviderActivityState;
}) {
  const logs = activity.logs ?? [];
  const retainedForLevel = levelCount(activity.counts, activity.level);

  return (
    <SettingsSection
      title="Recent activity"
      description="Provider operations, failures and health checks stored on this device."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={activity.level}
            onValueChange={(value) => {
              if (value === 'all' || value === 'info' || value === 'warn' || value === 'error') {
                activity.onLevelChange(value);
              }
            }}
          >
            <SelectTrigger aria-label="Filter activity by level" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warnings</SelectItem>
              <SelectItem value="error">Errors</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              downloadJson(
                `${providerId}-activity.json`,
                JSON.stringify(
                  { providerId, exportedAt: new Date().toISOString(), level: activity.level, logs },
                  null,
                  2,
                ),
              );
            }}
            disabled={logs.length === 0}
          >
            Export activity
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={activity.onClear}
            disabled={activity.isClearing || activity.counts.total === 0}
          >
            {activity.isClearing ? 'Clearing…' : 'Clear activity'}
          </Button>
        </div>

        {activity.isLoading ? (
          <LoadingState type="list" />
        ) : activity.error !== null ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load activity</AlertTitle>
            <AlertDescription>{activity.error}</AlertDescription>
          </Alert>
        ) : logs.length === 0 ? (
          <ActivityEmptyMessage level={activity.level} retained={retainedForLevel} />
        ) : (
          <ul aria-label="Provider activity entries" className="flex flex-col gap-2">
            {logs.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 rounded-control bg-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={logBadgeVariant(entry.level)}>{entry.level}</Badge>
                  <code className="text-xs text-muted-foreground">{entry.code}</code>
                  {/* react-doctor-disable-next-line react-doctor/no-locale-format-in-render -- ruling: extensions-activity-local-time: the section only renders from a client-side local DB query, so the reader's locale cannot mismatch SSR markup. */}
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="break-words text-sm">{entry.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSection>
  );
}

function ProviderOperationsSections({
  providerId,
  data,
  activity,
  health,
  update,
  updateConfirmOpen,
  onUpdateConfirmOpenChange,
}: {
  providerId: string;
  data: ProviderDetailData;
  activity?: ProviderActivityState | undefined;
  health?: ProviderHealthState | undefined;
  update?: ProviderUpdateState | undefined;
  updateConfirmOpen: boolean;
  onUpdateConfirmOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      {health !== undefined ? <HealthCheckSection health={health} /> : null}
      {update !== undefined ? (
        <UpdateSection
          data={data}
          update={update}
          confirmOpen={updateConfirmOpen}
          onConfirmOpenChange={onUpdateConfirmOpenChange}
          providerName={data.provider.manifest.name}
        />
      ) : null}
      {activity !== undefined ? (
        <ActivitySection providerId={providerId} activity={activity} />
      ) : null}
    </>
  );
}

export function ProviderDetailPage({
  providerId,
  data,
  isLoading,
  isError,
  onBack,
  onToggleEnabled,
  onSaveSettings,
  onRemove,
  isUpdating = false,
  isSavingSettings = false,
  settingsSaved = false,
  settingsError = null,
  activity,
  health,
  update,
}: ProviderDetailPageProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <section aria-label="Provider details" className="p-6">
        <LoadingState type="detail" />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label="Provider details" className="p-6">
        <ErrorState
          title="Could not load provider"
          message="Provider details failed to load. Try again in a moment."
        />
      </section>
    );
  }

  if (data === null || data === undefined) {
    return (
      <section aria-label="Provider details" className="p-6">
        <EmptyState type="provider-not-found" {...backAction(onBack)} />
      </section>
    );
  }

  const { provider, capabilities, permissions } = data;
  const enabledCapabilities = capabilities.filter((row) => row.enabled);
  const disabledCapabilities = capabilities.filter((row) => !row.enabled);

  return (
    <section aria-label="Provider details" className="@container flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          {onBack !== undefined ? (
            <Button type="button" variant="ghost" className="w-fit px-0" onClick={onBack}>
              Back to extensions
            </Button>
          ) : null}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{provider.manifest.name}</h1>
            <p className="text-sm text-muted-foreground">
              v{provider.installedVersion} · {provider.manifest.id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={provider.enabled ? 'default' : 'outline'}>
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Badge variant={healthBadgeVariant(provider.health)}>{provider.health}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isUpdating || provider.health === 'broken'}
            onClick={() => onToggleEnabled(!provider.enabled)}
          >
            {provider.enabled ? 'Disable provider' : 'Enable provider'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isUpdating}
            onClick={() => setConfirmOpen(true)}
          >
            Uninstall
          </Button>
          <a
            href={provider.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-control border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View source
            <ExternalLink aria-hidden className="ml-1 size-3.5" />
          </a>
        </div>
      </div>

      {provider.warnings.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Provider warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {provider.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection title="Overview" description="Install metadata and supported platforms.">
        <dl className="grid gap-4 @xl:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Publisher</dt>
            <dd>{provider.manifest.source.publisher ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Platforms</dt>
            <dd>{provider.manifest.compatibility.platforms.join(', ')}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Languages</dt>
            <dd>{provider.manifest.languages.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Installed</dt>
            {/* react-doctor-disable-next-line react-doctor/no-locale-format-in-render -- ruling: extensions-installed-at-local-time: this row only renders after the client-side local DB query resolves (the server has no DB), so formatting the install timestamp in the reader's locale cannot mismatch SSR markup. */}
            <dd>{new Date(provider.installedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </SettingsSection>

      <ProviderOperationsSections
        providerId={providerId}
        data={data}
        activity={activity}
        health={health}
        update={update}
        updateConfirmOpen={updateConfirmOpen}
        onUpdateConfirmOpenChange={setUpdateConfirmOpen}
      />

      <ProviderSettingsForm
        key={`${provider.id}:${JSON.stringify(data.settings)}`}
        manifest={provider.manifest}
        settings={data.settings}
        isSaving={isSavingSettings}
        isSaved={settingsSaved}
        errorMessage={settingsError}
        onSave={onSaveSettings}
      />

      <SettingsSection title="Capabilities" description="Features exposed by this provider.">
        <div className="flex flex-col gap-4">
          {enabledCapabilities.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {enabledCapabilities.map((row) => (
                <li key={row.key}>
                  <Badge>{row.label}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No enabled capabilities.</p>
          )}
          {disabledCapabilities.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Disabled: {disabledCapabilities.map((row) => row.label).join(', ')}
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Permissions"
        description="Network and storage access requested by the provider."
      >
        <ul className="flex flex-col gap-3">
          {permissions.map((row) => (
            <li key={row.key} className="rounded-control p-3">
              <p className="font-medium">{row.label}</p>
              <p className="text-sm text-muted-foreground">{row.description}</p>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection
        title="Content flags"
        description="Mature content support declared in the manifest."
      >
        <dl className="grid gap-3 @2xl:grid-cols-3">
          <div
            className="flex min-w-0 items-center justify-between gap-3 rounded-control bg-muted/40 p-3"
            data-testid="content-flag-tile"
          >
            <dt>NSFW</dt>
            <dd>
              <Switch
                checked={provider.manifest.contentFlags.nsfw}
                disabled
                aria-label="NSFW content flag"
              />
            </dd>
          </div>
          <div
            className="flex min-w-0 items-center justify-between gap-3 rounded-control bg-muted/40 p-3"
            data-testid="content-flag-tile"
          >
            <dt>Suggestive</dt>
            <dd>
              <Switch
                checked={provider.manifest.contentFlags.suggestive}
                disabled
                aria-label="Suggestive content flag"
              />
            </dd>
          </div>
          <div
            className="flex min-w-0 items-center justify-between gap-3 rounded-control bg-muted/40 p-3"
            data-testid="content-flag-tile"
          >
            <dt>Violence</dt>
            <dd>
              <Switch
                checked={provider.manifest.contentFlags.violence}
                disabled
                aria-label="Violence content flag"
              />
            </dd>
          </div>
        </dl>
      </SettingsSection>

      <UninstallProviderDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        providerName={provider.manifest.name}
        isUpdating={isUpdating}
        onConfirm={onRemove}
      />
    </section>
  );
}
