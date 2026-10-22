import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
  Switch,
} from '@app/design-system';
import type { ContentRating, ProviderManifest, ProviderSettingsValues } from '@app/shared';
import { useState } from 'react';

import {
  draftFromSettings,
  emptyProviderSettingsDraft,
  hasEditableProviderSettings,
  providerSettingsSupport,
  settingsFromDraft,
  type ProviderSettingsDraft,
  type ProviderSettingsSupportView,
} from '../settings-draft.js';

const DEFAULT_SELECT_VALUE = '__provider-default__';

const CONTENT_RATING_OPTIONS: readonly { value: ContentRating; label: string }[] = [
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'mature', label: 'Mature' },
  { value: 'explicit', label: 'Explicit' },
];

const DEFAULT_SORT_LABELS: Readonly<Record<string, string>> = {
  latest: 'Latest updates',
  popular: 'Popular',
};

type DraftUpdate = (patch: Partial<ProviderSettingsDraft>) => void;

function SettingToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} aria-label={label} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SettingSelectRow({
  id,
  label,
  description,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Select
        value={value.length > 0 ? value : DEFAULT_SELECT_VALUE}
        onValueChange={(next) => onChange(next === DEFAULT_SELECT_VALUE ? '' : next)}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={DEFAULT_SELECT_VALUE}>Provider default</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function TextListField({
  id,
  label,
  description,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function LanguagesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextListField
      id="provider-preferred-languages"
      label="Preferred languages"
      description="Comma-separated language codes for chapters and translations. Empty uses the provider default."
      placeholder="en, ja"
      value={value}
      onChange={onChange}
    />
  );
}

function RatingsField({
  selected,
  onToggle,
}: {
  selected: readonly ContentRating[];
  onToggle: (rating: ContentRating, checked: boolean) => void;
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">Content ratings</legend>
      <p className="text-sm text-muted-foreground">
        Leave every rating off to use the provider default. Turning NSFW off in app settings still
        limits results to safe and suggestive.
      </p>
      {CONTENT_RATING_OPTIONS.map((option) => (
        <div key={option.value} className="flex items-center justify-between gap-4">
          <Label htmlFor={`provider-rating-${option.value}`} className="text-sm">
            {option.label}
          </Label>
          <Switch
            id={`provider-rating-${option.value}`}
            aria-label={option.label}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => onToggle(option.value, checked)}
          />
        </div>
      ))}
    </fieldset>
  );
}

function AuthPlaceholder({ state }: { state: ProviderSettingsValues['authStatePlaceholder'] }) {
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">Authentication</p>
      <p className="text-sm text-muted-foreground">
        {state === 'session'
          ? 'The provider reports an active session on this device.'
          : 'Provider sign-in is not available in this build. This placeholder is saved for when it is.'}
      </p>
    </div>
  );
}

function SettingsFeedback({
  localError,
  errorMessage,
  isSaved,
}: {
  localError: string | null;
  errorMessage: string | null;
  isSaved: boolean;
}) {
  if (localError !== null || errorMessage !== null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Settings not saved</AlertTitle>
        <AlertDescription>{localError ?? errorMessage}</AlertDescription>
      </Alert>
    );
  }
  if (isSaved) {
    return <output className="block text-sm text-muted-foreground">Settings saved.</output>;
  }
  return null;
}

function SettingsActions({
  isSaving,
  onReset,
  onSubmit,
}: {
  isSaving: boolean;
  onReset: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={isSaving} onClick={onReset}>
        Reset to defaults
      </Button>
      <Button type="button" disabled={isSaving} onClick={onSubmit}>
        {isSaving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  );
}

function OptionalFields({
  support,
  draft,
  update,
  onToggleRating,
}: {
  support: ProviderSettingsSupportView;
  draft: ProviderSettingsDraft;
  update: DraftUpdate;
  onToggleRating: (rating: ContentRating, checked: boolean) => void;
}) {
  return (
    <>
      {support.languages ? (
        <LanguagesField
          value={draft.preferredLanguages}
          onChange={(value) => update({ preferredLanguages: value })}
        />
      ) : null}
      {support.nsfw ? (
        <SettingToggleRow
          id="provider-nsfw-allowed"
          label="Allow mature content"
          description="Request the provider's mature ratings when the app also allows explicit content."
          checked={draft.nsfwAllowed}
          onCheckedChange={(checked) => update({ nsfwAllowed: checked })}
        />
      ) : null}
      {support.ratings ? (
        <RatingsField selected={draft.contentRatingFilters} onToggle={onToggleRating} />
      ) : null}
      {support.tags ? (
        <>
          <TextListField
            id="provider-included-tags"
            label="Included tags"
            description="Comma-separated tag identifiers the provider understands. Empty includes every tag."
            placeholder="tag-id-a, tag-id-b"
            value={draft.includedTags}
            onChange={(value) => update({ includedTags: value })}
          />
          <TextListField
            id="provider-excluded-tags"
            label="Excluded tags"
            description="Comma-separated tag identifiers to hide from this provider's results."
            placeholder="tag-id-a, tag-id-b"
            value={draft.excludedTags}
            onChange={(value) => update({ excludedTags: value })}
          />
        </>
      ) : null}
      {support.regionLocales.length > 0 ? (
        <SettingSelectRow
          id="provider-region-locale"
          label="Region / locale"
          description="Preferred region for this provider's catalog."
          value={draft.regionLocale}
          options={support.regionLocales.map((locale) => ({ value: locale, label: locale }))}
          onChange={(value) => update({ regionLocale: value })}
        />
      ) : null}
      {support.defaultSorts.length > 0 ? (
        <SettingSelectRow
          id="provider-default-sort"
          label="Default sort"
          description="How browse sections order titles before any filters."
          value={draft.defaultSort}
          options={support.defaultSorts.map((sort) => ({
            value: sort,
            label: DEFAULT_SORT_LABELS[sort] ?? sort,
          }))}
          onChange={(value) => update({ defaultSort: value })}
        />
      ) : null}
    </>
  );
}

function AdvancedFields({
  manifest,
  support,
  draft,
  update,
}: {
  manifest: ProviderManifest;
  support: ProviderSettingsSupportView;
  draft: ProviderSettingsDraft;
  update: DraftUpdate;
}) {
  const rateLimitDefault = manifest.capabilityDetails?.find(
    (row) => row.rateLimitRpm !== undefined,
  )?.rateLimitRpm;
  return (
    <>
      {support.providerOptionKeys.length > 0 ? (
        <fieldset className="grid gap-4">
          <legend className="text-sm font-medium">Provider options</legend>
          {support.providerOptionKeys.map((key) => (
            <div key={key} className="grid gap-2">
              <Label htmlFor={`provider-option-${key}`}>{key}</Label>
              <Input
                id={`provider-option-${key}`}
                value={draft.providerOptions[key] ?? ''}
                onChange={(event) =>
                  update({
                    providerOptions: { ...draft.providerOptions, [key]: event.target.value },
                  })
                }
              />
            </div>
          ))}
        </fieldset>
      ) : null}
      {support.rateLimit ? (
        <div className="grid gap-2">
          <Label htmlFor="provider-rate-limit">Rate limit override (requests per minute)</Label>
          <p className="text-sm text-muted-foreground">
            {rateLimitDefault === undefined
              ? 'Requests allowed per minute. Empty uses the provider default.'
              : `Requests allowed per minute. Empty uses the provider default of ${rateLimitDefault}.`}
          </p>
          <Input
            id="provider-rate-limit"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draft.rateLimitOverrideRpm}
            onChange={(event) => update({ rateLimitOverrideRpm: event.target.value })}
          />
        </div>
      ) : null}
      {support.auth ? (
        <AuthPlaceholder
          state={draft.authStatePlaceholder === '' ? undefined : draft.authStatePlaceholder}
        />
      ) : null}
    </>
  );
}

export interface ProviderSettingsFormProps {
  manifest: ProviderManifest;
  settings: ProviderSettingsValues;
  isSaving: boolean;
  isSaved: boolean;
  errorMessage: string | null;
  onSave: (settings: ProviderSettingsValues) => void;
}

export function ProviderSettingsForm({
  manifest,
  settings,
  isSaving,
  isSaved,
  errorMessage,
  onSave,
}: ProviderSettingsFormProps) {
  const support = providerSettingsSupport(manifest);
  const [draft, setDraft] = useState<ProviderSettingsDraft>(() => draftFromSettings(settings));
  const [localError, setLocalError] = useState<string | null>(null);

  if (!hasEditableProviderSettings(support)) {
    return null;
  }

  const update: DraftUpdate = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const toggleRating = (rating: ContentRating, checked: boolean) => {
    update({
      contentRatingFilters: checked
        ? [...draft.contentRatingFilters, rating]
        : draft.contentRatingFilters.filter((value) => value !== rating),
    });
  };

  const submit = () => {
    const result = settingsFromDraft(draft, support);
    if (!result.ok) {
      setLocalError(result.error.message);
      return;
    }
    setLocalError(null);
    onSave(result.value);
  };

  return (
    <SettingsSection
      title="Provider settings"
      description="Only settings this provider declares are shown; saved values apply to the next provider request."
    >
      <div className="flex flex-col gap-6" data-testid="provider-settings-form">
        <OptionalFields
          support={support}
          draft={draft}
          update={update}
          onToggleRating={toggleRating}
        />
        <AdvancedFields manifest={manifest} support={support} draft={draft} update={update} />
        <SettingsFeedback localError={localError} errorMessage={errorMessage} isSaved={isSaved} />
        <SettingsActions
          isSaving={isSaving}
          onReset={() => {
            setDraft((current) => ({
              ...emptyProviderSettingsDraft(),
              authStatePlaceholder: current.authStatePlaceholder,
            }));
            setLocalError(null);
          }}
          onSubmit={submit}
        />
      </div>
    </SettingsSection>
  );
}
