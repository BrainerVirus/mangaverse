import type {
  AppResult,
  ContentRating,
  ProviderManifest,
  ProviderSettingsValues,
} from '@app/shared';
import { createAppError } from '@app/shared';

/** Which provider settings this manifest can actually honor. */
export interface ProviderSettingsSupportView {
  readonly languages: boolean;
  readonly nsfw: boolean;
  readonly ratings: boolean;
  readonly tags: boolean;
  readonly auth: boolean;
  readonly rateLimit: boolean;
  readonly regionLocales: readonly string[];
  readonly defaultSorts: readonly string[];
  readonly providerOptionKeys: readonly string[];
}

export function providerSettingsSupport(manifest: ProviderManifest): ProviderSettingsSupportView {
  const capabilities = manifest.capabilities;
  const auth =
    capabilities['auth.login'] === true ||
    capabilities['auth.logout'] === true ||
    capabilities['auth.library'] === true;
  return {
    languages: capabilities['metadata.languages'] === true,
    nsfw: capabilities['content.nsfw'] === true,
    ratings: capabilities['content.ratingFilter'] === true,
    tags: capabilities['content.tagFilter'] === true,
    auth,
    rateLimit: manifest.capabilityDetails?.some((row) => row.rateLimitRpm !== undefined) ?? false,
    regionLocales: manifest.settingsSupport?.regionLocales ?? [],
    defaultSorts: manifest.settingsSupport?.defaultSorts ?? [],
    providerOptionKeys: manifest.settingsSupport?.providerOptionKeys ?? [],
  };
}

export function hasEditableProviderSettings(support: ProviderSettingsSupportView): boolean {
  return (
    support.languages ||
    support.nsfw ||
    support.ratings ||
    support.tags ||
    support.auth ||
    support.rateLimit ||
    support.regionLocales.length > 0 ||
    support.defaultSorts.length > 0 ||
    support.providerOptionKeys.length > 0
  );
}

export interface ProviderSettingsDraft {
  readonly preferredLanguages: string;
  readonly nsfwAllowed: boolean;
  readonly contentRatingFilters: readonly ContentRating[];
  readonly includedTags: string;
  readonly excludedTags: string;
  readonly regionLocale: string;
  readonly rateLimitOverrideRpm: string;
  readonly defaultSort: string;
  readonly providerOptions: Readonly<Record<string, string>>;
  /** Read-only state loaded from the provider; preserved across saves. */
  readonly authStatePlaceholder: '' | 'anonymous' | 'session' | 'unknown';
}

export function draftFromSettings(settings: ProviderSettingsValues): ProviderSettingsDraft {
  const options: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings.providerOptions ?? {})) {
    options[key] = typeof value === 'string' ? value : String(value);
  }
  return {
    preferredLanguages: (settings.preferredLanguages ?? []).join(', '),
    nsfwAllowed: settings.nsfwAllowed === true,
    contentRatingFilters: settings.contentRatingFilters ?? [],
    includedTags: (settings.includedTags ?? []).join(', '),
    excludedTags: (settings.excludedTags ?? []).join(', '),
    regionLocale: settings.regionLocale ?? '',
    rateLimitOverrideRpm:
      settings.rateLimitOverrideRpm === undefined ? '' : String(settings.rateLimitOverrideRpm),
    defaultSort: settings.defaultSort ?? '',
    providerOptions: options,
    authStatePlaceholder: settings.authStatePlaceholder ?? '',
  };
}

export function emptyProviderSettingsDraft(): ProviderSettingsDraft {
  return draftFromSettings({});
}

function splitList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ];
}

/**
 * Sends only fields the manifest declares and drops empty values, so a saved
 * record means "use the provider default" rather than storing blank strings.
 */
export function settingsFromDraft(
  draft: ProviderSettingsDraft,
  support: ProviderSettingsSupportView,
): AppResult<ProviderSettingsValues> {
  type Mutable = { -readonly [K in keyof ProviderSettingsValues]?: ProviderSettingsValues[K] };
  const out: Mutable = {};

  if (support.languages) {
    const languages = splitList(draft.preferredLanguages);
    if (languages.length > 0) out.preferredLanguages = languages;
  }
  if (support.nsfw) out.nsfwAllowed = draft.nsfwAllowed;
  if (support.ratings && draft.contentRatingFilters.length > 0) {
    out.contentRatingFilters = [...draft.contentRatingFilters];
  }
  if (support.tags) {
    const included = splitList(draft.includedTags);
    const excluded = splitList(draft.excludedTags);
    if (included.length > 0) out.includedTags = included;
    if (excluded.length > 0) out.excludedTags = excluded;
  }
  if (support.regionLocales.length > 0 && draft.regionLocale.trim().length > 0) {
    out.regionLocale = draft.regionLocale.trim();
  }
  if (support.defaultSorts.length > 0 && draft.defaultSort.trim().length > 0) {
    out.defaultSort = draft.defaultSort.trim();
  }
  if (support.rateLimit && draft.rateLimitOverrideRpm.trim().length > 0) {
    const rpm = Number(draft.rateLimitOverrideRpm);
    if (!Number.isFinite(rpm) || rpm < 0) {
      return {
        ok: false,
        error: createAppError({
          code: 'extensions.core.settings.bad_rate_limit',
          message: 'Rate limit must be a non-negative number.',
        }),
      };
    }
    out.rateLimitOverrideRpm = rpm;
  }
  if (support.providerOptionKeys.length > 0) {
    const options: Record<string, unknown> = {};
    for (const key of support.providerOptionKeys) {
      const value = draft.providerOptions[key]?.trim() ?? '';
      if (value.length > 0) options[key] = value;
    }
    if (Object.keys(options).length > 0) out.providerOptions = options;
  }
  if (support.auth && draft.authStatePlaceholder !== '') {
    out.authStatePlaceholder = draft.authStatePlaceholder;
  }

  return { ok: true, value: out as ProviderSettingsValues };
}
