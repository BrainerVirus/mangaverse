import {
  ErrorState,
  Input,
  Label,
  LoadingState,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
  Switch,
} from '@app/design-system';
import type { AppSettings } from '@app/shared';
import { bytesToMegabytes, formatCacheBytes, megabytesToBytes } from '@app/cache';

export interface AppSettingsPageProps {
  readonly settings: AppSettings | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSaving?: boolean;
  readonly cacheUsageBytes?: number;
  onChange: (next: AppSettings) => void;
}

const LOCALE_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja', label: 'Japanese' },
] as const;

function SettingToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function parsePreferredLanguages(value: string, fallback: readonly string[]): readonly string[] {
  const codes = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^[a-z]{2}(-[A-Z]{2})?$/.test(part));
  return codes.length > 0 ? codes : fallback;
}

export function AppSettingsPage({
  settings,
  isLoading,
  isError,
  isSaving = false,
  cacheUsageBytes,
  onChange,
}: AppSettingsPageProps) {
  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </main>
    );
  }

  if (isError || settings === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load app settings"
          message="Local settings failed to load. Try again in a moment."
        />
      </main>
    );
  }

  const update = (patch: Partial<AppSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">App settings</h1>
        <p className="text-sm text-muted-foreground">
          Global preferences for content, performance, and localization.
          {isSaving ? ' Saving…' : null}
        </p>
      </div>

      <SettingsSection
        title="Content"
        description="Control what the app shows in search, browse, and recommendations."
      >
        <SettingToggleRow
          id="explicit-content"
          label="Explicit content"
          description="Allow mature series in search and browse results."
          checked={settings.explicitContent}
          disabled={isSaving}
          onCheckedChange={(explicitContent) => update({ explicitContent })}
        />
        <SettingToggleRow
          id="provider-errors"
          label="Show provider errors"
          description="Surface provider failures in the UI instead of hiding them silently."
          checked={settings.showProviderErrors}
          disabled={isSaving}
          onCheckedChange={(showProviderErrors) => update({ showProviderErrors })}
        />
      </SettingsSection>

      <SettingsSection
        title="Performance"
        description="Reduce memory use on constrained devices."
      >
        <SettingToggleRow
          id="low-memory-mode"
          label="Low-memory mode"
          description="Reduce preloading, thumbnails, and animation intensity."
          checked={settings.lowMemoryMode}
          disabled={isSaving}
          onCheckedChange={(lowMemoryMode) => update({ lowMemoryMode })}
        />
        <div className="grid gap-2 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
          <Label htmlFor="image-cache-limit">Image cache limit</Label>
          <Input
            id="image-cache-limit"
            type="number"
            min={50}
            max={10240}
            step={50}
            disabled={isSaving}
            value={bytesToMegabytes(settings.imageCacheLimitBytes)}
            onChange={(event) => {
              const megabytes = Number(event.target.value);
              if (!Number.isFinite(megabytes)) {
                return;
              }
              update({ imageCacheLimitBytes: megabytesToBytes(megabytes) });
            }}
          />
          <p className="text-sm text-muted-foreground">
            Cached cover images are stored locally and reused on later visits. Limit:{' '}
            {formatCacheBytes(settings.imageCacheLimitBytes)}
            {cacheUsageBytes !== undefined
              ? ` · Used: ${formatCacheBytes(cacheUsageBytes)}`
              : null}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Localization"
        description="Preferred languages and locale for content discovery."
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="preferred-languages">Preferred languages</Label>
            <Input
              id="preferred-languages"
              value={settings.preferredLanguages.join(', ')}
              disabled={isSaving}
              placeholder="en, ja"
              onChange={(event) =>
                update({
                  preferredLanguages: parsePreferredLanguages(event.target.value, settings.preferredLanguages),
                })
              }
            />
            <p className="text-sm text-muted-foreground">
              Comma-separated ISO language codes used when ranking search and browse results.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="locale">Locale</Label>
            <Select
              value={settings.locale}
              disabled={isSaving}
              onValueChange={(value) => update({ locale: value })}
            >
              <SelectTrigger id="locale" aria-label="Locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {LOCALE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>
    </main>
  );
}
