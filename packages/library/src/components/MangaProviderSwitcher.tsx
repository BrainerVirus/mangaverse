import { useState } from 'react';
import { Badge, Button } from '@app/design-system';
import type { MangaProviderMapping, ProviderMappingId } from '@app/shared';

export interface MangaProviderSwitcherProps {
  readonly mappings: readonly MangaProviderMapping[];
  readonly defaultMappingId: ProviderMappingId;
  readonly activeMappingId: ProviderMappingId;
  readonly preferredMappingId?: ProviderMappingId;
  readonly providerLabels?: Readonly<Record<string, string>>;
  readonly isPending?: boolean;
  onSelectMapping?: (mappingId: ProviderMappingId) => Promise<void> | void;
  onSetDefault?: (mappingId: ProviderMappingId) => Promise<void> | void;
  onSetPreferred?: (mappingId: ProviderMappingId) => Promise<void> | void;
}

export function MangaProviderSwitcher({
  mappings,
  defaultMappingId,
  activeMappingId,
  preferredMappingId,
  providerLabels,
  isPending = false,
  onSelectMapping,
  onSetDefault,
  onSetPreferred,
}: MangaProviderSwitcherProps) {
  const [error, setError] = useState<string | undefined>();

  function run(action: () => Promise<void> | void): void {
    setError(undefined);
    void Promise.resolve(action()).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not switch providers.');
    });
  }

  return (
    <section aria-label="Providers" aria-busy={isPending} className="space-y-3">
      <h2 className="text-xl font-semibold">Providers</h2>

      {mappings.length === 0 ? (
        <p className="rounded-box border border-border px-4 py-6 text-sm text-muted-foreground">
          No provider source is attached to this title.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mappings.map((mapping) => {
            const name = providerLabels?.[mapping.providerId] ?? mapping.providerId;
            const isDefault = mapping.id === defaultMappingId;
            const isActive = mapping.id === activeMappingId;
            const isPreferred = mapping.id === preferredMappingId;
            return (
              <li
                key={mapping.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-box border border-border px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{name}</span>
                    {isDefault ? <Badge variant="secondary">Default</Badge> : null}
                    {isPreferred ? <Badge variant="outline">Chapter source</Badge> : null}
                    {isActive ? <Badge>Viewing</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {mapping.providerId} · {mapping.providerMangaId}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isActive && onSelectMapping !== undefined ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => run(() => onSelectMapping(mapping.id))}
                    >
                      View chapters
                    </Button>
                  ) : null}
                  {!isDefault && onSetDefault !== undefined ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => onSetDefault(mapping.id))}
                    >
                      Set default
                    </Button>
                  ) : null}
                  {!isPreferred && onSetPreferred !== undefined ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => onSetPreferred(mapping.id))}
                    >
                      Use for chapters
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
