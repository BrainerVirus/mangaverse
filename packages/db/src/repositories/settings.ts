import { eq } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  err,
  ok,
  APP_SETTINGS_STORAGE_KEY,
  getDefaultAppSettings,
  getDefaultReaderSettings,
  sanitizeReaderSettings,
  validateAppSettings,
  validateReaderSettings,
  type AppSettings,
  type ReaderSettings,
  type ThemeSettings,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { appSettings, providerSettings, readerPreferences, themePreferences } from '../schema.js';

const GLOBAL_READER_ID = 'global' as const;
const GLOBAL_THEME_ID = 'global' as const;

export async function getTitleReaderSettings(
  db: AppDrizzleDb,
  mangaId: string,
): Promise<ReaderSettings> {
  const global = await getReaderSettings(db);
  if (!global.rememberPerTitleOverrides) return global;
  const row = db
    .select()
    .from(readerPreferences)
    .where(eq(readerPreferences.id, `title:${mangaId}`))
    .get();
  return sanitizeReaderSettings({ ...global, ...row?.settingsJson });
}

export async function upsertTitleReaderSettings(
  db: AppDrizzleDb,
  mangaId: string,
  settings: ReaderSettings,
): Promise<AppResult<void>> {
  const parsed = validateReaderSettings(settings);
  if (!parsed.ok) return err(parsed.error);
  const global = await getReaderSettings(db);
  const overrides = Object.fromEntries(
    Object.entries(parsed.value).filter(
      ([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(global[key as keyof ReaderSettings]),
    ),
  );
  const now = new Date().toISOString();
  await db
    .insert(readerPreferences)
    .values({ id: `title:${mangaId}`, settingsJson: overrides, updatedAt: now })
    .onConflictDoUpdate({
      target: readerPreferences.id,
      set: { settingsJson: overrides, updatedAt: now },
    });
  return ok(undefined);
}

export async function resetTitleReaderSettings(db: AppDrizzleDb, mangaId: string): Promise<void> {
  await db.delete(readerPreferences).where(eq(readerPreferences.id, `title:${mangaId}`));
}

export async function getReaderSettings(db: AppDrizzleDb): Promise<ReaderSettings> {
  const row = db
    .select()
    .from(readerPreferences)
    .where(eq(readerPreferences.id, GLOBAL_READER_ID))
    .get();
  if (row === undefined) return getDefaultReaderSettings();
  return sanitizeReaderSettings(row.settingsJson);
}

export async function upsertReaderSettings(
  db: AppDrizzleDb,
  settings: ReaderSettings,
): Promise<AppResult<void>> {
  const parsed = validateReaderSettings(settings);
  if (!parsed.ok) return err(parsed.error);

  const now = new Date().toISOString();
  await db
    .insert(readerPreferences)
    .values({
      id: GLOBAL_READER_ID,
      settingsJson: parsed.value as unknown as Record<string, unknown>,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: readerPreferences.id,
      set: { settingsJson: parsed.value as unknown as Record<string, unknown>, updatedAt: now },
    });
  return ok(undefined);
}

export async function getThemeSettings(db: AppDrizzleDb): Promise<ThemeSettings> {
  const row = db
    .select()
    .from(themePreferences)
    .where(eq(themePreferences.id, GLOBAL_THEME_ID))
    .get();
  if (row === undefined) return { themeId: 'default', dark: false };
  // Rows written before the themeId migration hold a built-in preset id; both are ids.
  return { themeId: row.presetId, dark: row.dark };
}

export async function upsertThemeSettings(
  db: AppDrizzleDb,
  settings: ThemeSettings,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(themePreferences)
    .values({
      id: GLOBAL_THEME_ID,
      presetId: settings.themeId,
      dark: settings.dark,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: themePreferences.id,
      set: { presetId: settings.themeId, dark: settings.dark, updatedAt: now },
    });
}

export async function getAppSettings(db: AppDrizzleDb): Promise<AppSettings> {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, APP_SETTINGS_STORAGE_KEY))
    .get();
  if (row === undefined) return getDefaultAppSettings();
  const parsed = validateAppSettings(row.valueJson);
  if (!parsed.ok) return getDefaultAppSettings();
  return parsed.value;
}

export async function upsertAppSettings(
  db: AppDrizzleDb,
  settings: AppSettings,
): Promise<AppResult<void>> {
  const parsed = validateAppSettings(settings);
  if (!parsed.ok) return err(parsed.error);

  const now = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: APP_SETTINGS_STORAGE_KEY, valueJson: parsed.value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: parsed.value, updatedAt: now },
    });
  return ok(undefined);
}

export async function getAppSetting(db: AppDrizzleDb, key: string): Promise<unknown> {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.valueJson;
}

export async function upsertAppSetting(
  db: AppDrizzleDb,
  key: string,
  value: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key, valueJson: value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: value, updatedAt: now },
    });
}

export async function getProviderSettingsRecord(
  db: AppDrizzleDb,
  providerId: string,
): Promise<{ readonly label?: string; readonly settings: Record<string, unknown> } | undefined> {
  const row = db
    .select()
    .from(providerSettings)
    .where(eq(providerSettings.providerId, providerId))
    .get();
  if (row === undefined) return undefined;
  return {
    ...(row.label !== null && row.label !== undefined && row.label !== ''
      ? { label: row.label }
      : {}),
    settings: row.settingsJson,
  };
}

export async function upsertProviderSettingsRecord(
  db: AppDrizzleDb,
  input: {
    readonly providerId: string;
    readonly label?: string;
    readonly settings: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(providerSettings)
    .values({
      providerId: input.providerId,
      label: input.label,
      settingsJson: input.settings,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: providerSettings.providerId,
      set: {
        label: input.label,
        settingsJson: input.settings,
        updatedAt: now,
      },
    });
}
