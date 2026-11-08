import {
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
  Switch,
  useStateReducer,
} from '@app/design-system';
import {
  MAX_IMAGE_CACHE_LIMIT_BYTES,
  MIN_IMAGE_CACHE_LIMIT_BYTES,
  type AppSettings,
} from '@app/shared';
import { bytesToMegabytes, formatCacheBytes, megabytesToBytes } from '@app/cache';

export interface AppSettingsPageProps {
  readonly settings: AppSettings | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly cacheUsageBytes?: number;
  onChange: (next: AppSettings, field?: 'cache') => void;
  /** Pointer-up or blur: commit a coalesced edit without waiting for the quiet window. */
  onInteractionEnd?: () => void;
  cacheSaveError?: boolean;
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
      <div className="flex flex-col gap-1">
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

function CacheLimitField({
  bytes,
  onChange,
  onInteractionEnd,
  saveError,
}: {
  bytes: number;
  onChange: (bytes: number) => void;
  onInteractionEnd: (() => void) | undefined;
  saveError: boolean;
}) {
  const [draft, setDraft] = useStateReducer(
    (_previous: string | null, next: string | null) => next,
    null,
  );
  const value = draft ?? String(bytesToMegabytes(bytes));
  const number = value.trim() === '' ? NaN : Number(value);
  const nextBytes = megabytesToBytes(number);
  const invalid =
    !Number.isFinite(number) ||
    nextBytes < MIN_IMAGE_CACHE_LIMIT_BYTES ||
    nextBytes > MAX_IMAGE_CACHE_LIMIT_BYTES;
  const message = invalid
    ? 'Enter a cache limit between 50 and 10,240 MiB.'
    : saveError
      ? 'Could not save the local cache limit. Check storage and change the value or blur the field to retry.'
      : null;
  return (
    <>
      <Input
        id="image-cache-limit"
        type="number"
        min={50}
        max={10240}
        step={50}
        value={value}
        aria-invalid={message !== null}
        aria-describedby={message ? 'image-cache-limit-error' : undefined}
        onBlur={() => {
          if (!invalid && saveError) onChange(nextBytes);
          onInteractionEnd?.();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = next.trim() === '' ? NaN : Number(next);
          const candidate = megabytesToBytes(parsed);
          if (
            !Number.isFinite(parsed) ||
            candidate < MIN_IMAGE_CACHE_LIMIT_BYTES ||
            candidate > MAX_IMAGE_CACHE_LIMIT_BYTES
          ) {
            return;
          }
          onChange(candidate);
        }}
      />
      {message && (
        <p id="image-cache-limit-error" className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
    </>
  );
}

const APP_SETTINGS_HEADER = {
  title: 'App settings',
  description: 'Global preferences for content, performance, and localization.',
} as const;

export function AppSettingsPage({
  settings,
  isLoading,
  isError,
  cacheUsageBytes,
  onChange,
  onInteractionEnd,
  cacheSaveError = false,
}: AppSettingsPageProps) {
  if (isLoading) {
    return (
      <PageContainer variant="read">
        <section aria-label="App settings" className="flex flex-col gap-6">
          <PageHeader {...APP_SETTINGS_HEADER} />
          <LoadingState type="sections" count={4} />
        </section>
      </PageContainer>
    );
  }

  if (isError || settings === undefined) {
    return (
      <PageContainer variant="read">
        <section aria-label="App settings">
          <ErrorState
            title="Could not load app settings"
            message="Local settings failed to load. Try again in a moment."
          />
        </section>
      </PageContainer>
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
    <PageContainer variant="read">
      <section aria-label="App settings" className="flex flex-col gap-6">
        <PageHeader {...APP_SETTINGS_HEADER} />

        <SettingsSection
          title="Appearance"
          description="Adjust motion and transparency across the app."
        >
          <div className="flex flex-col gap-4">
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
              description={
                settings.reduceTransparency ? 'Reduced transparency' : 'Full transparency'
              }
              checked={settings.reduceTransparency}
              onCheckedChange={(reduceTransparency) => commit({ reduceTransparency })}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Content"
          description="Control what the app shows in search, browse, and recommendations."
        >
          <div className="flex flex-col gap-4">
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

        <SettingsSection title="Storage" description="How much page data stays on this device.">
          <div className="grid gap-2">
            <Label htmlFor="image-cache-limit">Local cache limit</Label>
            <CacheLimitField
              bytes={settings.imageCacheLimitBytes}
              onChange={(imageCacheLimitBytes) =>
                onChange({ ...settings, imageCacheLimitBytes }, 'cache')
              }
              onInteractionEnd={onInteractionEnd}
              saveError={cacheSaveError}
            />
            <p className="text-sm text-muted-foreground">
              Covers and reader pages are stored locally and reused on later visits. Downloads are
              never removed automatically, even when the limit is reached. Limit:{' '}
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
    </PageContainer>
  );
}
