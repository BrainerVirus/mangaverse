import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ErrorState,
  Label,
  LoadingState,
  Switch,
  ThemeOption,
  ThemePreview,
  PageContainer,
  PageHeader,
} from '@app/design-system';
import type { ThemeDefinition, ThemeSettings } from '@app/shared';

import { THEME_PRESETS } from '../presets.js';
import { toThemePreviewDefinition, toThemePreviewDefinitionForPreset } from '../preview.js';
import { resolveEffectiveDark } from '../resolve-theme.js';
import { ConfirmDeleteThemeDialog } from './ConfirmDeleteThemeDialog.js';

const NO_THEMES: readonly ThemeDefinition[] = [];

export interface ThemeCustomizationPageProps {
  readonly settings: ThemeSettings | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSaving?: boolean;
  readonly customThemes?: readonly ThemeDefinition[];
  readonly areCustomThemesLoading?: boolean;
  readonly areCustomThemesError?: boolean;
  readonly isDeletingCustomTheme?: boolean;
  /** Fallback notice from ThemeProvider when the selected custom theme is unavailable. */
  readonly themeNotice?: string | null;
  /** Duplicate/delete failure from the route. */
  readonly actionError?: string | null;
  onChange: (next: ThemeSettings) => void;
  onDuplicatePreset?: (presetId: string) => void;
  onEditCustomTheme?: (themeId: string) => void;
  onDeleteCustomTheme?: (themeId: string) => void;
  onRetryCustomThemes?: () => void;
}

function ThemePresetCard({
  presetId,
  name,
  description,
  selected,
  previewDark,
  disabled,
  onSelect,
  onDuplicate,
}: {
  presetId: string;
  name: string;
  description: string;
  selected: boolean;
  previewDark: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onDuplicate?: () => void;
}) {
  const preview = toThemePreviewDefinitionForPreset(presetId, previewDark);

  return (
    <ThemeOption
      selected={selected}
      disabled={disabled}
      label={`Select ${name} theme`}
      onSelect={onSelect}
      actions={
        onDuplicate === undefined ? undefined : (
          <div className="px-1">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-label={`Duplicate ${name} theme`}
              onClick={onDuplicate}
            >
              Duplicate
            </Button>
          </div>
        )
      }
    >
      <ThemePreview theme={preview} />
      <div className="px-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </ThemeOption>
  );
}

function CustomThemeCard({
  definition,
  selected,
  previewDark,
  disabled,
  onSelect,
  onEdit,
  onDelete,
}: {
  definition: ThemeDefinition;
  selected: boolean;
  previewDark: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const preview = toThemePreviewDefinition(
    { themeId: definition.id, dark: previewDark },
    definition,
  );

  return (
    <ThemeOption
      selected={selected}
      disabled={disabled}
      label={`Select ${definition.name} theme`}
      onSelect={onSelect}
      actions={
        <div className="flex gap-2 px-1">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`Edit ${definition.name} theme`}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Delete ${definition.name} theme`}
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      }
    >
      <ThemePreview theme={preview} />
      <div className="px-1">
        <p className="text-sm font-medium text-foreground">{definition.name}</p>
        <p className="text-sm text-muted-foreground">
          {definition.basedOn === undefined
            ? 'Custom theme'
            : `Custom theme · based on ${definition.basedOn}`}
        </p>
      </div>
    </ThemeOption>
  );
}

interface CustomThemesSectionProps {
  readonly customThemes: readonly ThemeDefinition[];
  readonly areCustomThemesLoading: boolean;
  readonly areCustomThemesError: boolean;
  readonly isSaving: boolean;
  readonly selectedThemeId: string;
  readonly previewDark: boolean;
  onSelect: (themeId: string) => void;
  onEdit: ((themeId: string) => void) | undefined;
  onDelete: (definition: ThemeDefinition) => void;
  onRetry: (() => void) | undefined;
}

function CustomThemesSection({
  customThemes,
  areCustomThemesLoading,
  areCustomThemesError,
  isSaving,
  selectedThemeId,
  previewDark,
  onSelect,
  onEdit,
  onDelete,
  onRetry,
}: CustomThemesSectionProps) {
  return (
    <ThemeSection
      title="Your themes"
      description="Custom themes stored on this device. Select, edit or delete them here."
    >
      {areCustomThemesError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your themes</AlertTitle>
          <AlertDescription>
            Your custom themes may be unavailable. Retry to load them again.
          </AlertDescription>
          {onRetry === undefined ? null : (
            <Button size="sm" variant="outline" className="mt-3 text-foreground" onClick={onRetry}>
              Retry
            </Button>
          )}
        </Alert>
      ) : areCustomThemesLoading ? (
        <p className="type-body text-muted-foreground">Loading custom themes…</p>
      ) : customThemes.length === 0 ? (
        <p className="type-body text-muted-foreground">
          No custom themes yet. Duplicate a built-in theme to create one.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {customThemes.map((definition) => (
            <CustomThemeCard
              key={definition.id}
              definition={definition}
              selected={selectedThemeId === definition.id}
              previewDark={previewDark}
              disabled={isSaving}
              onSelect={() => onSelect(definition.id)}
              onEdit={() => onEdit?.(definition.id)}
              onDelete={() => onDelete(definition)}
            />
          ))}
        </div>
      )}
    </ThemeSection>
  );
}

function ThemeSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="type-heading text-foreground">{title}</h2>
        {description === undefined ? null : (
          <p className="type-body text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function ThemeHeading() {
  return (
    <PageHeader
      title="Theme"
      description="Choose a visual preset or one of your custom themes. Changes apply across the app and are saved locally."
    />
  );
}

export function ThemeCustomizationPage({
  settings,
  isLoading,
  isError,
  isSaving = false,
  customThemes = NO_THEMES,
  areCustomThemesLoading = false,
  areCustomThemesError = false,
  isDeletingCustomTheme = false,
  themeNotice = null,
  actionError = null,
  onChange,
  onDuplicatePreset,
  onEditCustomTheme,
  onDeleteCustomTheme,
  onRetryCustomThemes,
}: ThemeCustomizationPageProps) {
  const [pendingDelete, setPendingDelete] = useState<ThemeDefinition | null>(null);

  if (isLoading) {
    return (
      <PageContainer variant="read" className="max-w-5xl">
        <section aria-label="Theme" className="flex flex-col gap-8">
          <ThemeHeading />
          <LoadingState type="sections" count={2} />
        </section>
      </PageContainer>
    );
  }

  if (isError || settings === undefined) {
    return (
      <PageContainer variant="read" className="max-w-5xl">
        <section aria-label="Theme">
          <ErrorState
            title="Could not load theme settings"
            message="Your local database may be unavailable. Try reloading the page."
          />
        </section>
      </PageContainer>
    );
  }

  const previewDark = resolveEffectiveDark(settings);
  const usesSystemAppearance = settings.themeId === 'system';
  const appearanceLocked =
    settings.themeId === 'minimal-light' ||
    settings.themeId === 'minimal-dark' ||
    settings.themeId === 'amoled-black';

  return (
    <PageContainer variant="read" className="max-w-5xl">
      <section aria-label="Theme" className="flex flex-col gap-8">
        <ThemeHeading />

        {themeNotice === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>Theme unavailable</AlertTitle>
            <p className="type-body">{themeNotice}</p>
          </Alert>
        )}

        {actionError === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>Could not update themes</AlertTitle>
            <p className="type-body">{actionError}</p>
          </Alert>
        )}

        <ThemeSection
          title="Appearance"
          description="Switch between light and dark surfaces when your preset supports both modes."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="theme-dark-mode">Dark mode</Label>
              <p className="type-body text-muted-foreground">
                {usesSystemAppearance
                  ? 'System preset follows your device preference automatically.'
                  : appearanceLocked
                    ? 'This preset uses a fixed appearance mode.'
                    : 'Toggle dark surfaces for the selected preset.'}
              </p>
            </div>
            <Switch
              id="theme-dark-mode"
              checked={previewDark}
              disabled={isSaving || usesSystemAppearance || appearanceLocked}
              aria-label="Dark mode"
              onClick={() => onChange({ ...settings, dark: !settings.dark })}
            />
          </div>
        </ThemeSection>

        <ThemeSection
          title="Built-in themes"
          description="Each preset keeps shared component semantics while changing color personality. Duplicate one to start a custom theme."
        >
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {THEME_PRESETS.map((preset) => (
              <ThemePresetCard
                key={preset.id}
                presetId={preset.id}
                name={preset.name}
                description={preset.description}
                selected={settings.themeId === preset.id}
                previewDark={
                  preset.id === 'minimal-light'
                    ? false
                    : preset.id === 'minimal-dark' || preset.id === 'amoled-black'
                      ? true
                      : previewDark
                }
                disabled={isSaving}
                onSelect={() => onChange({ ...settings, themeId: preset.id })}
                {...(onDuplicatePreset === undefined
                  ? {}
                  : { onDuplicate: () => onDuplicatePreset(preset.id) })}
              />
            ))}
          </div>
        </ThemeSection>

        <CustomThemesSection
          customThemes={customThemes}
          areCustomThemesLoading={areCustomThemesLoading}
          areCustomThemesError={areCustomThemesError}
          isSaving={isSaving}
          selectedThemeId={settings.themeId}
          previewDark={previewDark}
          onSelect={(themeId) => onChange({ ...settings, themeId })}
          onEdit={onEditCustomTheme}
          onDelete={setPendingDelete}
          onRetry={onRetryCustomThemes}
        />

        <ConfirmDeleteThemeDialog
          open={pendingDelete !== null}
          themeName={pendingDelete?.name ?? ''}
          isDeleting={isDeletingCustomTheme}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          onConfirm={() => {
            if (pendingDelete === null) return;
            const themeId = pendingDelete.id;
            setPendingDelete(null);
            onDeleteCustomTheme?.(themeId);
          }}
        />
      </section>
    </PageContainer>
  );
}
