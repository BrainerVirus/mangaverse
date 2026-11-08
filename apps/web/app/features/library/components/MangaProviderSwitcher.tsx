import { Badge, Button, DividedList, DividedRow, EmptyNote, ListRow } from '@app/design-system';
import {
  providerDisplayName,
  type MangaProviderMapping,
  type ProviderMappingId,
} from '@app/shared';

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
  onUnmergeMapping?: (mappingId: ProviderMappingId) => Promise<void> | void;
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
  onUnmergeMapping,
}: MangaProviderSwitcherProps) {
  /**
   * A switch is a user's save: the caller's mutation reports a failure with its
   * toast, so a rejection is settled here and not shown a second time.
   */
  function run(action: () => Promise<void> | void): void {
    void Promise.resolve(action()).catch(() => undefined);
  }

  return (
    <section aria-label="Providers" aria-busy={isPending} className="flex flex-col gap-3">
      <h2 className="type-heading">Providers</h2>

      {mappings.length === 0 ? (
        <EmptyNote>No provider source is attached to this title.</EmptyNote>
      ) : (
        // One surface for the whole group and a hairline between providers: a bordered tile per
        // provider put a box inside a box for the common single-provider title.
        <ListRow as="div" tone="outline" padding="md">
          <DividedList>
            {mappings.map((mapping) => {
              const name = providerDisplayName(mapping.providerId, providerLabels);
              const isDefault = mapping.id === defaultMappingId;
              const isActive = mapping.id === activeMappingId;
              const isPreferred = mapping.id === preferredMappingId;
              return (
                <DividedRow key={mapping.id}>
                  <div className="min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {name !== undefined ? <span className="font-medium">{name}</span> : null}
                      {isDefault ? <Badge variant="secondary">Default</Badge> : null}
                      {isPreferred ? <Badge variant="outline">Chapter source</Badge> : null}
                      {isActive ? <Badge>Viewing</Badge> : null}
                    </div>
                    {/* The remote id identifies the source; the provider id stays out
                      of the UI because it is an implementation token. */}
                    <p className="truncate text-xs text-muted-foreground">
                      {mapping.providerMangaId}
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
                    {mappings.length > 1 && onUnmergeMapping !== undefined ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => run(() => onUnmergeMapping(mapping.id))}
                      >
                        Split title
                      </Button>
                    ) : null}
                  </div>
                </DividedRow>
              );
            })}
          </DividedList>
        </ListRow>
      )}
    </section>
  );
}
