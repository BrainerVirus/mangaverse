import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@app/design-system';
import { ExternalLink, Puzzle } from 'lucide-react';
import type { ExtensionsPageData } from '../types.js';

export interface ExtensionsPageProps {
  data: ExtensionsPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  onOpenProvider: (providerId: string) => void;
  onInstallProvider: () => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  pendingProviderId?: string | undefined;
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

export function ExtensionsPage({
  data,
  isLoading,
  isError,
  onOpenProvider,
  onInstallProvider,
  onToggleEnabled,
  pendingProviderId,
}: ExtensionsPageProps) {
  const providers = data?.providers ?? [];
  const providerCount = providers.length;

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Extensions</h1>
          <p className="text-sm text-muted-foreground">
            {providerCount === 1 ? '1 installed provider' : `${providerCount} installed providers`}
          </p>
        </div>
        <Button type="button" onClick={onInstallProvider}>
          Install provider
        </Button>
      </div>

      {isLoading ? <LoadingState type="grid" /> : null}

      {isError ? (
        <ErrorState
          title="Could not load extensions"
          message="Installed providers failed to load. Try again in a moment."
        />
      ) : null}

      {!isLoading && !isError && providerCount === 0 ? (
        <EmptyState
          type="no-provider"
          action={{ label: 'Install provider', onClick: onInstallProvider }}
        />
      ) : null}

      {!isLoading && !isError && providerCount > 0 ? (
        <section aria-label="Installed providers" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => {
            const isPending = pendingProviderId === provider.id;
            return (
              <Card key={provider.id} className="flex flex-col">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-accent/10 text-accent">
                        <Puzzle aria-hidden className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{provider.name}</CardTitle>
                        <CardDescription>v{provider.version}</CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge variant={provider.enabled ? 'default' : 'outline'}>
                        {provider.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <Badge variant={healthBadgeVariant(provider.health)}>{healthLabel(provider.health)}</Badge>
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
                      className="inline-flex items-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      Source
                      <ExternalLink aria-hidden className="ml-1 size-3.5" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
