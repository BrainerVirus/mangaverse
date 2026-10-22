import type { AppDrizzleDb } from '@app/db';
import type { AppResult, ProviderSettingsValues } from '@app/shared';
import { createAppError } from '@app/shared';

/**
 * Reads saved settings for provider calls. A settings read failure must not
 * turn into a provider outage: the call falls back to provider defaults.
 */
export async function loadProviderSettings(
  db: AppDrizzleDb,
  providerId: string,
): Promise<ProviderSettingsValues> {
  const { getProviderSettings } = await import('@app/extensions-core');
  try {
    const result = await getProviderSettings(providerId, { db });
    return result.ok ? result.value : {};
  } catch {
    return {};
  }
}

/** Validates against the installed manifest, then persists. */
export async function updateProviderSettings(
  db: AppDrizzleDb,
  providerId: string,
  settings: ProviderSettingsValues,
): Promise<AppResult<ProviderSettingsValues>> {
  const { listInstalledProviders, saveProviderSettings, validateProviderSettings } =
    await import('@app/extensions-core');
  const list = await listInstalledProviders(db);
  if (!list.ok) return list;

  const provider = list.value.find((entry) => String(entry.manifest.id) === providerId);
  if (provider === undefined) {
    return {
      ok: false,
      error: createAppError({
        code: 'extensions.core.providers.not_found',
        message: 'Installed provider not found.',
        details: { id: providerId },
      }),
    };
  }

  const validated = validateProviderSettings(provider.manifest, settings);
  if (!validated.ok) return validated;

  const saved = await saveProviderSettings(provider.manifest, validated.value, { db });
  if (!saved.ok) return saved;
  return validated;
}

/**
 * The app-wide explicit-content setting always wins over provider settings:
 * without it only safe and suggestive ratings may be requested.
 */
export function applyExplicitContentGate(
  settings: ProviderSettingsValues,
  explicitContent: boolean,
): ProviderSettingsValues {
  if (explicitContent) return settings;
  const ratings = settings.contentRatingFilters;
  return {
    ...settings,
    nsfwAllowed: false,
    ...(ratings !== undefined
      ? { contentRatingFilters: ratings.filter((r) => r === 'safe' || r === 'suggestive') }
      : {}),
  };
}
