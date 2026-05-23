import type { BackupValidationIssue } from '@app/shared';
import { validateBackupDocument, toMangaId } from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { libraryEntries, mangaIdentities, mangaProviderMappings } from '../schema.js';
import { listInstalledExtensions } from '../repositories/extensions.js';
import { getMangaIdentity } from '../repositories/identities.js';

export type RestorePreviewSeverity = 'info' | 'warning' | 'error';

export interface RestorePreviewIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: RestorePreviewSeverity;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RestorePreviewReport {
  readonly backupOk: boolean;
  readonly backupIssues: readonly BackupValidationIssue[];
  readonly previewIssues: readonly RestorePreviewIssue[];
}

function add(
  issues: RestorePreviewIssue[],
  input: { readonly code: string; readonly message: string; readonly severity: RestorePreviewSeverity; readonly details?: RestorePreviewIssue['details'] },
): void {
  issues.push({
    code: input.code,
    message: input.message,
    severity: input.severity,
    ...(input.details !== undefined ? { details: input.details } : {}),
  });
}

/**
 * Validates a backup payload and compares it against the current local database **without mutating** data.
 */
export async function previewBackupRestore(db: AppDrizzleDb, input: unknown): Promise<RestorePreviewReport> {
  const validation = validateBackupDocument(input);
  if (!validation.ok) {
    return { backupOk: false, backupIssues: validation.issues, previewIssues: [] };
  }

  const doc = validation.value;
  const previewIssues: RestorePreviewIssue[] = [];

  const remoteKey = (providerId: string, providerMangaId: string) => `${providerId}::${providerMangaId}`;
  const seenRemotes = new Set<string>();
  for (const identity of doc.mangaIdentities) {
    for (const mapping of identity.providerMappings) {
      const key = remoteKey(mapping.providerId, mapping.providerMangaId);
      if (seenRemotes.has(key)) {
        add(previewIssues, {
          code: 'restore.duplicate_remote_mapping',
          message: 'Backup contains duplicate provider remote ids.',
          severity: 'error',
          details: { key },
        });
      }
      seenRemotes.add(key);
    }
  }

  const dbMappings = await db.select().from(mangaProviderMappings).all();
  const dbRemoteToMapping = new Map<string, typeof dbMappings[number]>();
  for (const row of dbMappings) {
    dbRemoteToMapping.set(remoteKey(row.providerId, row.providerMangaId), row);
  }

  for (const identity of doc.mangaIdentities) {
    for (const mapping of identity.providerMappings) {
      const key = remoteKey(mapping.providerId, mapping.providerMangaId);
      const dbMapping = dbRemoteToMapping.get(key);
      if (dbMapping !== undefined && dbMapping.mangaId !== identity.id) {
        add(previewIssues, {
          code: 'restore.remote_collision_with_db',
          message: 'A backup provider remote id already exists in the local database under a different manga identity.',
          severity: 'warning',
          details: {
            providerId: mapping.providerId,
            providerMangaId: mapping.providerMangaId,
            backupMangaId: identity.id,
            dbMangaId: dbMapping.mangaId,
          },
        });
      }
    }
  }

  const identityIds = new Set(doc.mangaIdentities.map((m) => m.id));
  for (const entry of doc.library) {
    if (!identityIds.has(entry.mangaId)) {
      add(previewIssues, {
        code: 'restore.library_missing_identity',
        message: 'Library entry references a manga identity missing from the backup document.',
        severity: 'error',
        details: { libraryEntryId: entry.id, mangaId: entry.mangaId },
      });
    }
  }

  const installedProviderIds = new Set(doc.installedExtensions.map((e) => e.manifest.id));
  for (const identity of doc.mangaIdentities) {
    for (const mapping of identity.providerMappings) {
      if (!installedProviderIds.has(mapping.providerId)) {
        add(previewIssues, {
          code: 'restore.missing_installed_provider',
          message: 'Backup references a provider mapping without a matching installed extension snapshot.',
          severity: 'warning',
          details: { providerId: mapping.providerId, mangaId: identity.id },
        });
      }
    }
  }

  const currentIdentityRows = await db.select({ id: mangaIdentities.id, canonicalTitle: mangaIdentities.canonicalTitle }).from(mangaIdentities).all();
  const currentById = new Map(currentIdentityRows.map((r) => [r.id, r.canonicalTitle]));

  for (const identity of doc.mangaIdentities) {
    const currentTitle = currentById.get(identity.id);
    if (currentTitle !== undefined && currentTitle !== identity.canonicalTitle) {
      add(previewIssues, {
        code: 'restore.identity_title_conflict',
        message: 'An identity with the same id already exists with a different canonical title.',
        severity: 'warning',
        details: { mangaId: identity.id },
      });
    }
  }

  const currentLibraryMangaIds = new Set((await db.select({ mangaId: libraryEntries.mangaId }).from(libraryEntries).all()).map((r) => r.mangaId));
  const backupLibraryMangaIds = new Set(doc.library.map((e) => String(e.mangaId)));
  for (const mangaId of currentLibraryMangaIds) {
    if (!backupLibraryMangaIds.has(mangaId)) {
      add(previewIssues, {
        code: 'restore.destructive.library_removed',
        message: 'A manga currently in the local library is not present in the backup library list.',
        severity: 'info',
        details: { mangaId },
      });
    }
  }

  const currentInstalled = await listInstalledExtensions(db);
  const currentProviderIds = new Set(currentInstalled.map((e) => e.manifest.id));
  for (const ext of doc.installedExtensions) {
    if (currentProviderIds.has(ext.manifest.id) && ext.enabled === false) {
      add(previewIssues, {
        code: 'restore.provider_disabled_in_backup',
        message: 'Backup would import a disabled extension record for a provider that is currently installed.',
        severity: 'info',
        details: { providerId: ext.manifest.id },
      });
    }
  }

  await Promise.all(
    doc.mangaIdentities.map(async (identity) => {
      const live = await getMangaIdentity(db, toMangaId(identity.id));
      if (live !== undefined && live.defaultProviderMappingId !== identity.defaultProviderMappingId) {
        add(previewIssues, {
          code: 'restore.default_mapping_change',
          message: 'Default provider mapping differs between backup and local database.',
          severity: 'info',
          details: { mangaId: identity.id },
        });
      }
    }),
  );

  return { backupOk: true, backupIssues: [], previewIssues };
}
