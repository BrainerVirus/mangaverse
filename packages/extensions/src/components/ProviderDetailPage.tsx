import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  SettingsSection,
  Switch,
} from '@app/design-system';
import type { ExtensionInstallPreview } from '@app/extensions-core';
import { ExternalLink } from 'lucide-react';
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

function healthBadgeVariant(
  health: ProviderDetailData['provider']['health'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (health === 'broken') return 'destructive';
  if (health === 'degraded') return 'outline';
  return 'secondary';
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
  if (isLoading) {
    return (
      <main className="p-6">
        <LoadingState type="detail" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-6">
        <ErrorState
          title="Could not load provider"
          message="Provider details failed to load. Try again in a moment."
        />
      </main>
    );
  }

  if (data === null || data === undefined) {
    return (
      <main className="p-6">
        <EmptyState type="no-provider" />
      </main>
    );
  }

  const { provider, capabilities, permissions } = data;
  const enabledCapabilities = capabilities.filter((row) => row.enabled);
  const disabledCapabilities = capabilities.filter((row) => !row.enabled);

  return (
    <main className="flex flex-col gap-6 p-6">
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
          <Button type="button" variant="destructive" disabled={isUpdating} onClick={onRemove}>
            Uninstall
          </Button>
          <a
            href={provider.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-[var(--radius-control)] border border-[var(--border)] bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
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
        <dl className="grid gap-4 sm:grid-cols-2">
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

      <SettingsSection title="Permissions" description="Network and storage access requested by the provider.">
        <ul className="flex flex-col gap-3">
          {permissions.map((row) => (
            <li key={row.key} className="rounded-[var(--radius-control)] border border-[var(--border)] p-3">
              <p className="font-medium">{row.label}</p>
              <p className="text-sm text-muted-foreground">{row.description}</p>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Content flags" description="Mature content support declared in the manifest.">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
            <dt>NSFW</dt>
            <dd>
              <Switch checked={provider.manifest.contentFlags.nsfw} disabled aria-label="NSFW content flag" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
            <dt>Suggestive</dt>
            <dd>
              <Switch
                checked={provider.manifest.contentFlags.suggestive}
                disabled
                aria-label="Suggestive content flag"
              />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
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
    </main>
  );
}

export function formatInstallPreview(preview: ExtensionInstallPreview): string {
  return `${preview.providerName} v${preview.version}`;
}
