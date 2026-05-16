import type { AppResult } from '@app/shared';
import { err, ok } from '@app/shared';
import type { ContentRating, ProviderManifest } from '@app/shared';
import type { AppDrizzleDb } from '@app/db';
import { getProviderSettingsRecord, upsertProviderSettingsRecord } from '@app/db';

import type { ProviderSettingsValues } from './settings.js';
import { validateProviderSettings } from './settings.js';

export interface ExtensionSettingsDependencies {
  readonly db: AppDrizzleDb;
}

function settingsToRecord(values: ProviderSettingsValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (values.enabled !== undefined) out['enabled'] = values.enabled;
  if (values.preferredLanguages !== undefined) out['preferredLanguages'] = [...values.preferredLanguages];
  if (values.nsfwAllowed !== undefined) out['nsfwAllowed'] = values.nsfwAllowed;
  if (values.includedTags !== undefined) out['includedTags'] = [...values.includedTags];
  if (values.excludedTags !== undefined) out['excludedTags'] = [...values.excludedTags];
  if (values.contentRatingFilters !== undefined) out['contentRatingFilters'] = [...values.contentRatingFilters];
  if (values.regionLocale !== undefined) out['regionLocale'] = values.regionLocale;
  if (values.authStatePlaceholder !== undefined) out['authStatePlaceholder'] = values.authStatePlaceholder;
  if (values.providerOptions !== undefined) out['providerOptions'] = { ...values.providerOptions };
  if (values.rateLimitOverrideRpm !== undefined) out['rateLimitOverrideRpm'] = values.rateLimitOverrideRpm;
  if (values.defaultSort !== undefined) out['defaultSort'] = values.defaultSort;
  return out;
}

export function isStringArray(arr: unknown): arr is string[] {
  return Array.isArray(arr) && arr.every((v) => typeof v === 'string');
}

const VALID_CONTENT_RATINGS: readonly string[] = ['unknown', 'safe', 'suggestive', 'mature', 'explicit'];

function isContentRatingArray(arr: unknown): arr is string[] {
  return Array.isArray(arr) && arr.every((v) => typeof v === 'string' && VALID_CONTENT_RATINGS.includes(v));
}

export function recordToSettings(record: Record<string, unknown>): ProviderSettingsValues {
  type Mutable = { -readonly [K in keyof ProviderSettingsValues]?: ProviderSettingsValues[K] };
  const out: Mutable = {};
  if (typeof record['enabled'] === 'boolean') {
    out.enabled = record['enabled'];
  }
  if (isStringArray(record['preferredLanguages'])) {
    out.preferredLanguages = record['preferredLanguages'];
  }
  if (typeof record['nsfwAllowed'] === 'boolean') {
    out.nsfwAllowed = record['nsfwAllowed'];
  }
  if (isStringArray(record['includedTags'])) {
    out.includedTags = record['includedTags'];
  }
  if (isStringArray(record['excludedTags'])) {
    out.excludedTags = record['excludedTags'];
  }
  if (isContentRatingArray(record['contentRatingFilters'])) {
    out.contentRatingFilters = record['contentRatingFilters'] as readonly ContentRating[];
  }
  if (typeof record['regionLocale'] === 'string') {
    out.regionLocale = record['regionLocale'];
  }
  if (
    record['authStatePlaceholder'] === 'anonymous' ||
    record['authStatePlaceholder'] === 'session' ||
    record['authStatePlaceholder'] === 'unknown'
  ) {
    out.authStatePlaceholder = record['authStatePlaceholder'];
  }
  if (record['providerOptions'] !== undefined && typeof record['providerOptions'] === 'object' && record['providerOptions'] !== null) {
    out.providerOptions = record['providerOptions'] as Record<string, unknown>;
  }
  if (typeof record['rateLimitOverrideRpm'] === 'number') {
    out.rateLimitOverrideRpm = record['rateLimitOverrideRpm'];
  }
  if (typeof record['defaultSort'] === 'string') {
    out.defaultSort = record['defaultSort'];
  }
  return out as ProviderSettingsValues;
}

export async function saveProviderSettings(
  manifest: ProviderManifest,
  settings: ProviderSettingsValues,
  deps: ExtensionSettingsDependencies,
): Promise<AppResult<void>> {
  const validated = validateProviderSettings(manifest, settings);
  if (!validated.ok) {
    return err(validated.error);
  }
  await upsertProviderSettingsRecord(deps.db, {
    providerId: String(manifest.id),
    settings: settingsToRecord(validated.value),
  });
  return ok(undefined);
}

export async function getProviderSettings(
  providerId: string,
  deps: ExtensionSettingsDependencies,
): Promise<AppResult<ProviderSettingsValues>> {
  const row = await getProviderSettingsRecord(deps.db, providerId);
  if (row === undefined) {
    return ok({});
  }
  return ok(recordToSettings(row.settings));
}
