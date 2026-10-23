import { eq } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  validateProviderManifest,
  toExtensionInstallId,
  type ExtensionInstallMetadata,
  type ExtensionRegistryEntry,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { extensionRegistries, installedExtensions, providerSettings } from '../schema.js';
import { withTransaction } from '../transactions.js';

function newId(): string {
  return crypto.randomUUID();
}

export async function listInstalledExtensions(
  db: AppDrizzleDb,
): Promise<ExtensionInstallMetadata[]> {
  const rows = db.select().from(installedExtensions).all();
  const out: ExtensionInstallMetadata[] = [];
  for (const row of rows) {
    const manifestResult = validateProviderManifest(row.manifestJson);
    if (!manifestResult.ok) continue;
    out.push({
      id: toExtensionInstallId(row.id),
      manifest: manifestResult.value,
      sourceUrl: row.sourceUrl,
      ...(row.manifestUrl !== null && row.manifestUrl !== undefined && row.manifestUrl !== ''
        ? { manifestUrl: row.manifestUrl }
        : {}),
      ...(row.registryUrl !== null && row.registryUrl !== undefined && row.registryUrl !== ''
        ? { registryUrl: row.registryUrl }
        : {}),
      ...(row.checksum !== null && row.checksum !== undefined && row.checksum !== ''
        ? { checksum: row.checksum }
        : {}),
      installedVersion: row.installedVersion,
      enabled: row.enabled,
      installedAt: row.installedAt,
      ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== ''
        ? { updatedAt: row.updatedAt }
        : {}),
      state: row.state as ExtensionInstallMetadata['state'],
      health: row.health as ExtensionInstallMetadata['health'],
      warnings: row.warningsJson as ExtensionInstallMetadata['warnings'],
    });
  }
  return out;
}

export async function upsertInstalledExtension(
  db: AppDrizzleDb,
  metadata: ExtensionInstallMetadata,
): Promise<AppResult<void>> {
  const manifestResult = validateProviderManifest(metadata.manifest);
  if (!manifestResult.ok) {
    return err(
      createAppError({
        code: 'db.extensions.manifest_invalid',
        message: 'Extension manifest is invalid.',
        details: { causeCode: manifestResult.error.code },
      }),
    );
  }

  const now = new Date().toISOString();
  await db
    .insert(installedExtensions)
    .values({
      id: metadata.id,
      manifestJson: manifestResult.value as unknown as Record<string, unknown>,
      sourceUrl: metadata.sourceUrl,
      manifestUrl: metadata.manifestUrl,
      registryUrl: metadata.registryUrl,
      checksum: metadata.checksum,
      installedVersion: metadata.installedVersion,
      enabled: metadata.enabled,
      installedAt: metadata.installedAt,
      updatedAt: metadata.updatedAt ?? now,
      state: metadata.state,
      health: metadata.health,
      warningsJson: [...metadata.warnings],
    })
    .onConflictDoUpdate({
      target: installedExtensions.id,
      set: {
        manifestJson: manifestResult.value as unknown as Record<string, unknown>,
        sourceUrl: metadata.sourceUrl,
        manifestUrl: metadata.manifestUrl,
        registryUrl: metadata.registryUrl,
        checksum: metadata.checksum,
        installedVersion: metadata.installedVersion,
        enabled: metadata.enabled,
        updatedAt: metadata.updatedAt ?? now,
        state: metadata.state,
        health: metadata.health,
        warningsJson: [...metadata.warnings],
      },
    });

  return ok(undefined);
}

/**
 * Updates only the health column. A health check must never rewrite install
 * state such as `enabled` from a snapshot it read before a user toggle.
 */
export async function updateInstalledExtensionHealth(
  db: AppDrizzleDb,
  id: string,
  health: ExtensionInstallMetadata['health'],
): Promise<void> {
  await db
    .update(installedExtensions)
    .set({ health, updatedAt: new Date().toISOString() })
    .where(eq(installedExtensions.id, id));
}

export async function listExtensionRegistries(db: AppDrizzleDb): Promise<ExtensionRegistryEntry[]> {
  const rows = db.select().from(extensionRegistries).all();
  return rows.map((r) => ({
    name: r.name,
    registryUrl: r.registryUrl,
    ...(r.description !== null && r.description !== undefined && r.description !== ''
      ? { description: r.description }
      : {}),
  }));
}

export async function upsertExtensionRegistry(
  db: AppDrizzleDb,
  input: ExtensionRegistryEntry & { readonly id?: string },
): Promise<void> {
  // Re-importing the same registry URL must update that row, not add a duplicate.
  const existingId =
    input.id ??
    db
      .select({ id: extensionRegistries.id })
      .from(extensionRegistries)
      .where(eq(extensionRegistries.registryUrl, input.registryUrl))
      .all()[0]?.id;
  const id = existingId ?? newId();
  const now = new Date().toISOString();
  await db
    .insert(extensionRegistries)
    .values({
      id,
      name: input.name,
      registryUrl: input.registryUrl,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: extensionRegistries.id,
      set: {
        name: input.name,
        registryUrl: input.registryUrl,
        description: input.description,
        updatedAt: now,
      },
    });
}

/** Uninstall: the install row and its saved settings go together, or neither does. */
export async function deleteInstalledExtension(db: AppDrizzleDb, id: string): Promise<void> {
  withTransaction(db, (tx) => {
    tx.delete(installedExtensions).where(eq(installedExtensions.id, id)).run();
    tx.delete(providerSettings).where(eq(providerSettings.providerId, id)).run();
  });
}
