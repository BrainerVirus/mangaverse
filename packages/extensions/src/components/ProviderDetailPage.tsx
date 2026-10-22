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
  SettingsSection,
  Switch,
} from '@app/design-system';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { ProviderDetailData } from '../types.js';

export interface ProviderDetailPageProps {
  providerId: string;
  data: ProviderDetailData | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onBack?: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRemove: () => void;
  isUpdating?: boolean;
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

export function ProviderDetailPage({
  data,
  isLoading,
  isError,
  onBack,
  onToggleEnabled,
  onRemove,
  isUpdating = false,
}: ProviderDetailPageProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

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
