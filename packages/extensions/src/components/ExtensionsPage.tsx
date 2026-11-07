import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  ListRow,
  PageContainer,
  PageHeader,
  Skeleton,
  buttonSizes,
  buttonVariants,
  cn,
} from '@app/design-system';
import type { ExtensionRegistryEntry } from '@app/shared';
import { ExternalLink, Puzzle } from 'lucide-react';
import type { ExtensionsPageData, InstalledProviderSummary } from '../types.js';

export interface ExtensionsPageProps {
  data: ExtensionsPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  onOpenProvider: (providerId: string) => void;
  onInstallProvider: () => void;
  onImportRegistry: () => void;
  onExportExtensions: () => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  pendingProviderId?: string | undefined;
  isExporting?: boolean;
  exportError?: string | null;
  exportWarnings?: readonly string[];
  importWarnings?: readonly string[];
}

function healthBadgeVariant(
  health: ExtensionsPageData['providers'][number]['health'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (health === 'broken') return 'destructive';
  if (health === 'degraded') return 'outline';
  return 'secondary';
}

function healthLabel(health: ExtensionsPageData['providers'][number]['health']): string {
  if (health === 'broken') return 'Broken';
  if (health === 'degraded') return 'Degraded';
  if (health === 'unknown') return 'Unknown';
  return 'Healthy';
}

function WarningAlert({ title, warnings }: { title: string; warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function ExportFeedback({
  exportError,
  exportWarnings,
  importWarnings,
}: {
  exportError: string | null;
  exportWarnings: readonly string[];
  importWarnings: readonly string[];
}) {
  return (
    <>
      {exportError !== null ? (
        <Alert variant="destructive">
          <AlertTitle>Export failed</AlertTitle>
          <AlertDescription>{exportError}</AlertDescription>
        </Alert>
      ) : null}
      <WarningAlert title="Exported with warnings" warnings={exportWarnings} />
      <WarningAlert title="Import finished with warnings" warnings={importWarnings} />
    </>
  );
}

function ProviderCard({
  provider,
  isPending,
  onOpenProvider,
  onToggleEnabled,
}: {
  provider: InstalledProviderSummary;
  isPending: boolean;
  onOpenProvider: (providerId: string) => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
}) {
  return (
    <Card className="flex min-w-0 flex-col" data-testid="provider-card">
      <CardHeader className="gap-3" data-testid="provider-card-header">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent">
              <Puzzle aria-hidden className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{provider.name}</CardTitle>
              <CardDescription>v{provider.version}</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2" data-testid="provider-card-badges">
            <Badge variant={provider.enabled ? 'default' : 'outline'}>
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Badge variant={healthBadgeVariant(provider.health)}>
              {healthLabel(provider.health)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Capabilities</dt>
            <dd>{provider.capabilityCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Languages</dt>
            <dd>{provider.languages.join(', ') || '—'}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenProvider(provider.id)}>
            Details
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || provider.health === 'broken'}
            onClick={() => onToggleEnabled(provider.id, !provider.enabled)}
          >
            {provider.enabled ? 'Disable' : 'Enable'}
          </Button>
          <a
            href={provider.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants.ghost, buttonSizes.sm, 'text-muted-foreground')}
          >
            Source
            <ExternalLink aria-hidden />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderGrid({
  providers,
  pendingProviderId,
  onOpenProvider,
  onToggleEnabled,
}: {
  providers: readonly InstalledProviderSummary[];
  pendingProviderId: string | undefined;
  onOpenProvider: (providerId: string) => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
}) {
  if (providers.length === 0) return null;
  return (
    <section aria-label="Installed providers" className={PROVIDER_GRID_CLASSES}>
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isPending={pendingProviderId === provider.id}
          onOpenProvider={onOpenProvider}
          onToggleEnabled={onToggleEnabled}
        />
      ))}
    </section>
  );
}

const PROVIDER_GRID_CLASSES = 'grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3';

/** A provider card's own boxes: icon and two lines, two figures, three actions. */
function ProviderCardSkeleton() {
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-10 shrink-0" />
            <div className="min-w-0">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex h-6 items-center">
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderGridSkeleton() {
  return (
    <section aria-label="Installed providers" aria-busy="true" className={PROVIDER_GRID_CLASSES}>
      <ProviderCardSkeleton />
      <ProviderCardSkeleton />
    </section>
  );
}

function RegistryList({
  registries,
  hasProviders,
  isExporting,
  onExportExtensions,
}: {
  registries: readonly ExtensionRegistryEntry[];
  hasProviders: boolean;
  isExporting: boolean;
  onExportExtensions: () => void;
}) {
  if (registries.length === 0 && !hasProviders) return null;
  const exportButton = hasProviders ? (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onExportExtensions}
      disabled={isExporting}
    >
      {isExporting ? 'Exporting…' : 'Export extensions'}
    </Button>
  ) : null;
  if (registries.length === 0) {
    return <div className="flex justify-end">{exportButton}</div>;
  }
  return (
    <section aria-label="Imported registries" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-heading">Imported registries</h2>
          <p className="text-sm text-muted-foreground">
            Registry documents saved on this device. Their entries are not installed; install a
            provider from its manifest URL to use it.
          </p>
        </div>
        {exportButton}
      </div>
      <ul className="flex flex-col gap-2">
        {registries.map((registry) => (
          <ListRow
            as="li"
            key={registry.registryUrl}
            tone="outline"
            padding="md"
            data-testid="registry-row"
          >
            <p className="font-medium">{registry.name}</p>
            <p className="break-all text-sm text-muted-foreground">{registry.registryUrl}</p>
            {registry.description !== undefined ? (
              <p className="text-sm text-muted-foreground">{registry.description}</p>
            ) : null}
          </ListRow>
        ))}
      </ul>
    </section>
  );
}

export function ExtensionsPage({
  data,
  isLoading,
  isError,
  onOpenProvider,
  onInstallProvider,
  onImportRegistry,
  onExportExtensions,
  onToggleEnabled,
  pendingProviderId,
  isExporting = false,
  exportError = null,
  exportWarnings = [],
  importWarnings = [],
}: ExtensionsPageProps) {
  const providers = data?.providers ?? [];
  const registries = data?.registries ?? [];
  const providerCount = providers.length;
  const showEmptyState = !isLoading && !isError && providerCount === 0;

  return (
    <PageContainer>
      <section aria-label="Extensions" className="@container flex flex-col gap-6">
        <PageHeader
          title="Extensions"
          description={
            isLoading
              ? 'Installed providers'
              : providerCount === 1
                ? '1 installed provider'
                : `${providerCount} installed providers`
          }
          actions={
            <>
              <Button type="button" variant="outline" onClick={onImportRegistry}>
                Import
              </Button>
              <Button type="button" onClick={onInstallProvider}>
                Install provider
              </Button>
            </>
          }
        />

        <ExportFeedback
          exportError={exportError}
          exportWarnings={exportWarnings}
          importWarnings={importWarnings}
        />

        {isLoading ? <ProviderGridSkeleton /> : null}

        {isError ? (
          <ErrorState
            title="Could not load extensions"
            message="Installed providers failed to load. Try again in a moment."
          />
        ) : null}

        {showEmptyState ? (
          <EmptyState
            type="no-provider"
            action={{ label: 'Install provider', onClick: onInstallProvider }}
          />
        ) : null}

        {!isLoading && !isError ? (
          <ProviderGrid
            providers={providers}
            pendingProviderId={pendingProviderId}
            onOpenProvider={onOpenProvider}
            onToggleEnabled={onToggleEnabled}
          />
        ) : null}

        {!isLoading && !isError ? (
          <RegistryList
            registries={registries}
            hasProviders={providerCount > 0}
            isExporting={isExporting}
            onExportExtensions={onExportExtensions}
          />
        ) : null}
      </section>
    </PageContainer>
  );
}
