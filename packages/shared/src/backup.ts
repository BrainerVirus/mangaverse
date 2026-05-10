import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';
import type { ExtensionInstallMetadata } from './extension-install.js';
import type { LibraryEntry } from './library.js';
import type { MangaIdentity, ProviderId } from './manga.js';
import { toProviderId } from './manga.js';
import type { ReaderSettings } from './reader-settings.js';
import { getDefaultReaderSettings, validateReaderSettings } from './reader-settings.js';
import { validateProviderManifest } from './provider.js';

export const BACKUP_SCHEMA_VERSION = 1 as const;

export interface BackupMetadata {
  readonly createdAt: string;
  readonly appVersion: string;
  readonly deviceName?: string;
}

export interface BackupProviderSnapshot {
  readonly providerId: ProviderId;
  readonly label?: string;
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface BackupSettingsSnapshot {
  readonly providerSnapshots: readonly BackupProviderSnapshot[];
}

export interface ThemeSettings {
  readonly presetId: string;
  readonly dark: boolean;
}

export interface BackupDocumentV1 {
  readonly schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  readonly metadata: BackupMetadata;
  readonly library: readonly LibraryEntry[];
  readonly mangaIdentities: readonly MangaIdentity[];
  readonly installedExtensions: readonly ExtensionInstallMetadata[];
  readonly readerSettings: ReaderSettings;
  readonly providerSettings: BackupSettingsSnapshot;
  readonly themeSettings: ThemeSettings;
}

export interface BackupValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type BackupValidationResult = AppResult<BackupDocumentV1> & {
  readonly issues: readonly BackupValidationIssue[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateProviderSettings(input: unknown): AppResult<BackupSettingsSnapshot> {
  if (!isPlainObject(input)) {
    return err(
      createAppError({ code: 'backup.invalid', message: 'providerSettings must be an object.' }),
    );
  }
  const snaps = input['providerSnapshots'];
  if (!Array.isArray(snaps)) {
    return err(
      createAppError({
        code: 'backup.invalid',
        message: 'providerSettings.providerSnapshots must be an array.',
      }),
    );
  }
  const out: BackupProviderSnapshot[] = [];
  for (const s of snaps) {
    if (!isPlainObject(s) || !isNonEmptyString(s['providerId'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each provider snapshot requires providerId.',
        }),
      );
    }
    const settings = s['settings'];
    if (!isPlainObject(settings)) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each provider snapshot requires a settings object.',
        }),
      );
    }
    out.push({
      providerId: toProviderId(String(s['providerId'])),
      ...(typeof s['label'] === 'string' ? { label: s['label'] } : {}),
      settings,
    });
  }
  return ok({ providerSnapshots: out });
}

function validateThemeSettings(input: unknown): AppResult<ThemeSettings> {
  if (!isPlainObject(input)) {
    return err(createAppError({ code: 'backup.invalid', message: 'themeSettings must be an object.' }));
  }
  if (!isNonEmptyString(input['presetId'])) {
    return err(createAppError({ code: 'backup.invalid', message: 'themeSettings.presetId is required.' }));
  }
  if (typeof input['dark'] !== 'boolean') {
    return err(createAppError({ code: 'backup.invalid', message: 'themeSettings.dark must be boolean.' }));
  }
  return ok({ presetId: String(input['presetId']), dark: input['dark'] });
}

function validateLibraryEntries(input: unknown): AppResult<readonly LibraryEntry[]> {
  if (!Array.isArray(input)) {
    return err(createAppError({ code: 'backup.invalid', message: 'library must be an array.' }));
  }
  for (const item of input) {
    if (!isPlainObject(item) || !isNonEmptyString(item['id']) || !isNonEmptyString(item['mangaId'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each library entry must be an object with id and mangaId.',
        }),
      );
    }
  }
  return ok(input as readonly LibraryEntry[]);
}

function validateMangaIdentities(input: unknown): AppResult<readonly MangaIdentity[]> {
  if (!Array.isArray(input)) {
    return err(
      createAppError({ code: 'backup.invalid', message: 'mangaIdentities must be an array.' }),
    );
  }
  for (const item of input) {
    if (!isPlainObject(item) || !isNonEmptyString(item['id'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each manga identity must be an object with id.',
        }),
      );
    }
    if (!isNonEmptyString(item['canonicalTitle'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each manga identity must include canonicalTitle.',
        }),
      );
    }
    if (!Array.isArray(item['alternativeTitles'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each manga identity must include alternativeTitles array.',
        }),
      );
    }
    if (typeof item['merged'] !== 'boolean') {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each manga identity must include merged boolean.',
        }),
      );
    }
    if (!Array.isArray(item['providerMappings'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each manga identity must include providerMappings array.',
        }),
      );
    }
    if (!isNonEmptyString(item['defaultProviderMappingId'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each manga identity must include defaultProviderMappingId.',
        }),
      );
    }
  }
  return ok(input as readonly MangaIdentity[]);
}

function validateInstalledExtensions(input: unknown): AppResult<readonly ExtensionInstallMetadata[]> {
  if (!Array.isArray(input)) {
    return err(
      createAppError({ code: 'backup.invalid', message: 'installedExtensions must be an array.' }),
    );
  }
  for (const item of input) {
    if (!isPlainObject(item)) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each installed extension must be an object.',
        }),
      );
    }
    if (!isNonEmptyString(item['id']) || !isNonEmptyString(item['sourceUrl'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each extension requires id and sourceUrl.',
        }),
      );
    }
    if (!isNonEmptyString(item['installedVersion'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each extension requires installedVersion.',
        }),
      );
    }
    if (!isNonEmptyString(item['installedAt'])) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Each extension requires installedAt.',
        }),
      );
    }
    if (typeof item['enabled'] !== 'boolean') {
      return err(
        createAppError({ code: 'backup.invalid', message: 'Each extension requires enabled boolean.' }),
      );
    }
    const state = item['state'];
    const allowedStates = new Set(['pending', 'installing', 'installed', 'disabled', 'failed', 'uninstalled']);
    if (typeof state !== 'string' || !allowedStates.has(state)) {
      return err(createAppError({ code: 'backup.invalid', message: 'Each extension requires a valid state.' }));
    }
    const health = item['health'];
    const allowedHealth = new Set(['ok', 'degraded', 'broken', 'unknown']);
    if (typeof health !== 'string' || !allowedHealth.has(health)) {
      return err(createAppError({ code: 'backup.invalid', message: 'Each extension requires a valid health.' }));
    }
    if (!Array.isArray(item['warnings'])) {
      return err(
        createAppError({ code: 'backup.invalid', message: 'Each extension requires warnings array.' }),
      );
    }
    const manifestResult = validateProviderManifest(item['manifest']);
    if (!manifestResult.ok) {
      return err(
        createAppError({
          code: 'backup.invalid',
          message: 'Extension manifest failed validation.',
          details: { extensionId: String(item['id']), causeCode: manifestResult.error.code },
        }),
      );
    }
  }
  return ok(input as readonly ExtensionInstallMetadata[]);
}

export function validateBackupDocument(input: unknown): BackupValidationResult {
  const issues: BackupValidationIssue[] = [];

  function addIssue(path: string, code: string, message: string) {
    issues.push({ path, code, message });
  }

  function fail(code: string, message: string): BackupValidationResult {
    addIssue('', code, message);
    return { ok: false, error: createAppError({ code, message }), issues };
  }

  if (!isPlainObject(input)) {
    return fail('backup.invalid', 'Backup document must be an object.');
  }

  if (input['schemaVersion'] !== BACKUP_SCHEMA_VERSION) {
    addIssue('schemaVersion', 'backup.invalid', `Expected schemaVersion ${BACKUP_SCHEMA_VERSION}, got ${String(input['schemaVersion'])}`);
    return {
      ok: false,
      error: createAppError({
        code: 'backup.invalid',
        message: 'Unsupported or missing backup schemaVersion.',
        details: { received: String(input['schemaVersion']) },
      }),
      issues,
    };
  }

  const metadata = input['metadata'];
  const metadataOk = isPlainObject(metadata);
  if (!metadataOk || !isNonEmptyString(metadata['createdAt'])) {
    addIssue('metadata.createdAt', 'backup.invalid', 'metadata.createdAt is required.');
  }
  if (!metadataOk || !isNonEmptyString(metadata['appVersion'])) {
    addIssue('metadata.appVersion', 'backup.invalid', 'metadata.appVersion is required.');
  }

  const libraryResult = validateLibraryEntries(input['library']);
  if (!libraryResult.ok) {
    addIssue('library', libraryResult.error.code, libraryResult.error.message);
  }

  const mangaResult = validateMangaIdentities(input['mangaIdentities']);
  if (!mangaResult.ok) {
    addIssue('mangaIdentities', mangaResult.error.code, mangaResult.error.message);
  }

  const extResult = validateInstalledExtensions(input['installedExtensions']);
  if (!extResult.ok) {
    addIssue('installedExtensions', extResult.error.code, extResult.error.message);
  }

  const readerResult = validateReaderSettings(input['readerSettings']);
  if (!readerResult.ok) {
    addIssue('readerSettings', readerResult.error.code, readerResult.error.message);
  }

  const providerResult = validateProviderSettings(input['providerSettings']);
  if (!providerResult.ok) {
    addIssue('providerSettings', providerResult.error.code, providerResult.error.message);
  }

  const themeResult = validateThemeSettings(input['themeSettings']);
  if (!themeResult.ok) {
    addIssue('themeSettings', themeResult.error.code, themeResult.error.message);
  }

  if (issues.length > 0) {
    const first = issues[0]!;
    return {
      ok: false,
      error: createAppError({ code: 'backup.invalid', message: first.message }),
      issues,
    };
  }

  if (!isPlainObject(metadata)) {
    return fail('backup.invalid', 'metadata must be an object.');
  }

  const doc: BackupDocumentV1 = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    metadata: {
      createdAt: String(metadata['createdAt']),
      appVersion: String(metadata['appVersion']),
      ...(typeof metadata['deviceName'] === 'string' ? { deviceName: metadata['deviceName'] } : {}),
    },
    library: libraryResult.ok ? libraryResult.value : ([] as unknown as readonly LibraryEntry[]),
    mangaIdentities: mangaResult.ok ? mangaResult.value : ([] as unknown as readonly MangaIdentity[]),
    installedExtensions: extResult.ok ? extResult.value : ([] as unknown as readonly ExtensionInstallMetadata[]),
    readerSettings: readerResult.ok ? readerResult.value : getDefaultReaderSettings(),
    providerSettings: providerResult.ok ? providerResult.value : ({ providerSnapshots: [] } as BackupSettingsSnapshot),
    themeSettings: themeResult.ok ? themeResult.value : ({ presetId: '', dark: false }),
  };

  return { ok: true, value: doc, issues: [] };
}
