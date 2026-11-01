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
  readonly cacheUsageBytes?: number;
  onChange: (next: AppSettings) => void;
  /** Pointer-up or blur: commit a coalesced edit without waiting for the quiet window. */
  onInteractionEnd?: () => void;
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
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-describedby={`${id}-description`}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

const LANGUAGE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

/** Comma-separated language codes; invalid fragments are dropped at commit time. */
function parsePreferredLanguages(value: string): readonly string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => LANGUAGE_PATTERN.test(part));
}

/**
 * Uncontrolled on purpose: the field is the draft. Parsing every keystroke made
 * commas and partial tags vanish while typing, and clearing the box restored the
 * saved list. Commit on blur or Enter; an empty or wholly invalid list reverts.
 */
function PreferredLanguagesField({
  languages,
  onChange,
  onInteractionEnd,
}: {
  languages: readonly string[];
  onChange: (next: readonly string[]) => void;
  onInteractionEnd: (() => void) | undefined;
}) {
  const committed = languages.join(', ');

  const commit = (input: HTMLInputElement) => {
    const next = parsePreferredLanguages(input.value);
    if (next.length === 0) {
      input.value = committed;
    } else {
      // Normalize even when the parsed list matches: an invalid fragment must
      // not stay on screen when only the committed list is stored.
      input.value = next.join(', ');
      if (next.join(', ') !== committed) onChange(next);
    }
    onInteractionEnd?.();
  };

  return (
    <Input
      id="preferred-languages"
      key={committed}
      defaultValue={committed}
      placeholder="en, ja"
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function AppSettingsPage({
  settings,
  isLoading,
  isError,
  cacheUsageBytes,
  onChange,
  onInteractionEnd,
}: AppSettingsPageProps) {
  if (isLoading) {
    return (
      <section aria-label="App settings" className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </section>
    );
  }

  if (isError || settings === undefined) {
    return (
      <section aria-label="App settings" className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load app settings"
          message="Local settings failed to load. Try again in a moment."
        />
      </section>
    );
  }

  const update = (patch: Partial<AppSettings>) => {
    onChange({ ...settings, ...patch });
  };
  const commit = (patch: Partial<AppSettings>) => {
    update(patch);
    onInteractionEnd?.();
  };

  return (
    <section aria-label="App settings" className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">App settings</h1>
        <p className="text-sm text-muted-foreground">
          Global preferences for content, performance, and localization.
        </p>
      </div>

      <SettingsSection
        title="Appearance"
        description="Adjust motion and transparency across the app."
      >
        <div className="space-y-4">
          <SettingToggleRow
            id="reduce-motion"
            label="Motion"
            description={settings.reduceMotion ? 'Reduced motion' : 'Full motion'}
            checked={settings.reduceMotion}
            onCheckedChange={(reduceMotion) => commit({ reduceMotion })}
          />
          <SettingToggleRow
            id="reduce-transparency"
            label="Transparency"
            description={settings.reduceTransparency ? 'Reduced transparency' : 'Full transparency'}
            checked={settings.reduceTransparency}
            onCheckedChange={(reduceTransparency) => commit({ reduceTransparency })}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Content"
        description="Control what the app shows in search, browse, and recommendations."
      >
        <div className="space-y-4">
          <SettingToggleRow
            id="explicit-content"
            label="Explicit content"
            description="Allow mature series in search and browse results."
            checked={settings.explicitContent}
            onCheckedChange={(explicitContent) => commit({ explicitContent })}
          />
          <SettingToggleRow
            id="provider-errors"
            label="Show provider errors in search"
            description="Surface provider failures in search results instead of hiding them silently."
            checked={settings.showProviderErrors}
            onCheckedChange={(showProviderErrors) => commit({ showProviderErrors })}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Performance" description="Reduce memory use on constrained devices.">
        <div className="space-y-4">
          <SettingToggleRow
            id="low-memory-mode"
            label="Low-memory mode"
            description="Reduce preloading, thumbnails, and animation intensity."
            checked={settings.lowMemoryMode}
            onCheckedChange={(lowMemoryMode) => commit({ lowMemoryMode })}
          />
          <div className="grid gap-2">
            <Label htmlFor="image-cache-limit">Local cache limit</Label>
            <Input
              id="image-cache-limit"
              type="number"
              min={50}
              max={10240}
              step={50}
              value={bytesToMegabytes(settings.imageCacheLimitBytes)}
              onBlur={onInteractionEnd}
              onChange={(event) => {
                const megabytes = Number(event.target.value);
                if (!Number.isFinite(megabytes)) {
                  return;
                }
                update({ imageCacheLimitBytes: megabytesToBytes(megabytes) });
              }}
            />
            <p className="text-sm text-muted-foreground">
              Covers and reader pages are stored locally and reused on later visits. Limit:{' '}
              {formatCacheBytes(settings.imageCacheLimitBytes)}
              {cacheUsageBytes !== undefined
                ? ` · Used: ${formatCacheBytes(cacheUsageBytes)}`
                : null}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Localization"
        description="Preferred languages and locale for content discovery."
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="preferred-languages">Preferred languages</Label>
            <PreferredLanguagesField
              languages={settings.preferredLanguages}
              onChange={(preferredLanguages) => update({ preferredLanguages })}
              onInteractionEnd={onInteractionEnd}
            />
            <p className="text-sm text-muted-foreground">
              Comma-separated ISO language codes used when ranking search and browse results.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="locale">Locale</Label>
            <Select value={settings.locale} onValueChange={(value) => commit({ locale: value })}>
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
    </section>
  );
}
