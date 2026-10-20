import { backupDocumentSchema, toBackupValidationIssues } from './backup-schema.js';
import type { ExtensionInstallMetadata } from './extension-install.js';
import type { LibraryEntry } from './library.js';
import type { MangaIdentity, ProviderId } from './manga.js';
import type { ReaderSettings } from './reader-settings.js';
import { createAppError, type AppResult } from './result.js';
import type { ThemeDefinition } from './theme-definition.js';

export const BACKUP_SCHEMA_VERSION = 2 as const;
/** v1 predates custom themes; both are readable, new exports write v2. */
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS: readonly number[] = [1, 2];

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
  /** A built-in preset id or a custom theme id stored in the `themes` table. */
  readonly themeId: string;
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
  /** Custom themes only: built-ins are resolved from code. */
  readonly themes: readonly ThemeDefinition[];
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

/**
 * Validates a whole backup document, nested entities included, through
 * `backupDocumentSchema`. The `{ok, error, issues}` shape and the schema versions
 * stay stable so `parse-backup-file`, `restore-preview` and `restore-apply` need
 * no changes.
 */
export function validateBackupDocument(input: unknown): BackupValidationResult {
  if (!isPlainObject(input)) {
    const message = 'Backup document must be an object.';
    return {
      ok: false,
      error: createAppError({ code: 'backup.invalid', message }),
      issues: [{ path: '', code: 'backup.invalid', message }],
    };
  }

  if (!SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(Number(input['schemaVersion']))) {
    const message = `Expected schemaVersion ${SUPPORTED_BACKUP_SCHEMA_VERSIONS.join(' or ')}, got ${String(input['schemaVersion'])}`;
    return {
      ok: false,
      error: createAppError({
        code: 'backup.invalid',
        message: 'Unsupported or missing backup schemaVersion.',
        details: { received: String(input['schemaVersion']) },
      }),
      issues: [{ path: 'schemaVersion', code: 'backup.invalid', message }],
    };
  }

  const parsed = backupDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issues = toBackupValidationIssues(parsed.error);
    return {
      ok: false,
      error: createAppError({ code: 'backup.invalid', message: issues[0]!.message }),
      issues,
    };
  }

  return {
    ok: true,
    value: { ...parsed.data, schemaVersion: BACKUP_SCHEMA_VERSION } as unknown as BackupDocumentV1,
    issues: [],
  };
}
