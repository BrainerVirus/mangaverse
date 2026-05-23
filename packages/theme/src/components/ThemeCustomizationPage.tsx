import {
  ErrorState,
  Label,
  LoadingState,
  SettingsSection,
  Switch,
  ThemePreview,
} from '@app/design-system';
import type { ThemeSettings } from '@app/shared';

import { THEME_PRESETS } from '../presets.js';
import { toThemePreviewDefinitionForPreset } from '../preview.js';
import { resolveEffectiveDark } from '../resolve-theme.js';

export interface ThemeCustomizationPageProps {
  readonly settings: ThemeSettings | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSaving?: boolean;
  onChange: (next: ThemeSettings) => void;
}

function ThemePresetCard({
  presetId,
  name,
  description,
  selected,
  previewDark,
  disabled,
  onSelect,
}: {
  presetId: string;
  name: string;
  description: string;
  selected: boolean;
  previewDark: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const preview = toThemePreviewDefinitionForPreset(presetId, previewDark);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Select ${name} theme`}
      onClick={onSelect}
      className="group flex w-full max-w-[280px] flex-col items-start gap-2 rounded-[var(--radius-box)] border border-transparent p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
      data-selected={selected ? 'true' : 'false'}
    >
      <div
        className={
          selected
            ? 'rounded-[var(--radius-box)] ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]'
            : 'rounded-[var(--radius-box)] group-hover:ring-1 group-hover:ring-[var(--border)]'
        }
      >
        <ThemePreview theme={preview} />
      </div>
      <div className="px-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function ThemeCustomizationPage({
  settings,
  isLoading,
  isError,
  isSaving = false,
  onChange,
}: ThemeCustomizationPageProps) {
  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl p-6">
        <LoadingState type="list" />
      </main>
    );
  }

  if (isError || settings === undefined) {
    return (
      <main className="mx-auto w-full max-w-5xl p-6">
        <ErrorState
          title="Could not load theme settings"
          message="Your local database may be unavailable. Try reloading the page."
        />
      </main>
    );
  }

  const previewDark = resolveEffectiveDark(settings);
  const usesSystemAppearance = settings.presetId === 'system';
  const appearanceLocked =
    settings.presetId === 'minimal-light' ||
    settings.presetId === 'minimal-dark' ||
    settings.presetId === 'amoled-black';

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Theme</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Choose a visual preset and appearance mode. Changes apply across the app and are saved locally.
        </p>
      </header>

      <SettingsSection
        title="Appearance"
        description="Switch between light and dark surfaces when your preset supports both modes."
      >
        <div className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
          <div className="space-y-1">
            <Label htmlFor="theme-dark-mode" className="text-sm font-medium">
              Dark mode
            </Label>
            <p className="text-sm text-muted-foreground">
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
      </SettingsSection>

      <SettingsSection
        title="Presets"
        description="Each preset keeps shared component semantics while changing color personality."
      >
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {THEME_PRESETS.map((preset) => (
            <ThemePresetCard
              key={preset.id}
              presetId={preset.id}
              name={preset.name}
              description={preset.description}
              selected={settings.presetId === preset.id}
              previewDark={
                preset.id === 'minimal-light'
                  ? false
                  : preset.id === 'minimal-dark' || preset.id === 'amoled-black'
                    ? true
                    : previewDark
              }
              disabled={isSaving}
              onSelect={() => onChange({ ...settings, presetId: preset.id })}
            />
          ))}
        </div>
      </SettingsSection>
    </main>
  );
}
