import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import type { ExtensionInstallMetadata, ExtensionInstallWarning, ProviderManifest } from '@app/shared';
import type { AppDrizzleDb } from '@app/db';
import { deleteInstalledExtension, listInstalledExtensions, upsertInstalledExtension } from '@app/db';

export async function listInstalledProviders(db: AppDrizzleDb): Promise<AppResult<readonly ExtensionInstallMetadata[]>> {
  try {
    const rows = await listInstalledExtensions(db);
    return ok(rows);
  } catch (e) {
    return err(
      createAppError({
        code: 'extensions.core.providers.list_failed',
        message: 'Could not list installed providers.',
        cause: e,
      }),
    );
  }
}

async function loadById(
  db: AppDrizzleDb,
  id: string,
): Promise<AppResult<ExtensionInstallMetadata>> {
  const list = await listInstalledExtensions(db);
  const found = list.find((x) => x.id === id);
  if (!found) {
    return err(
      createAppError({
        code: 'extensions.core.providers.not_found',
        message: 'Installed provider not found.',
        details: { id },
      }),
    );
  }
  return ok(found);
}

export async function disableInstalledProvider(
  id: string,
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<void>> {
  const cur = await loadById(deps.db, id);
  if (!cur.ok) return err(cur.error);
  const next: ExtensionInstallMetadata = { ...cur.value, enabled: false, updatedAt: new Date().toISOString() };
  return upsertInstalledExtension(deps.db, next);
}

export async function enableInstalledProvider(
  id: string,
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<void>> {
  const cur = await loadById(deps.db, id);
  if (!cur.ok) return err(cur.error);
  const next: ExtensionInstallMetadata = { ...cur.value, enabled: true, updatedAt: new Date().toISOString() };
  return upsertInstalledExtension(deps.db, next);
}

export async function markProviderBroken(
  id: string,
  warning: ExtensionInstallWarning,
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<void>> {
  const cur = await loadById(deps.db, id);
  if (!cur.ok) return err(cur.error);
  const next: ExtensionInstallMetadata = {
    ...cur.value,
    health: 'broken',
    enabled: false,
    warnings: [...cur.value.warnings, warning],
    updatedAt: new Date().toISOString(),
  };
  return upsertInstalledExtension(deps.db, next);
}

export async function uninstallInstalledProvider(
  id: string,
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<void>> {
  const cur = await loadById(deps.db, id);
  if (!cur.ok) return err(cur.error);
  await deleteInstalledExtension(deps.db, id);
  return ok(undefined);
}

export async function updateInstalledProviderManifest(
  id: string,
  manifest: ProviderManifest,
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<void>> {
  const cur = await loadById(deps.db, id);
  if (!cur.ok) return err(cur.error);
  if (String(manifest.id) !== String(id)) {
    return err(
      createAppError({
        code: 'extensions.core.providers.manifest_id_mismatch',
        message: 'Manifest provider id must match the installed extension id.',
        details: { id, manifestId: String(manifest.id) },
      }),
    );
  }
  const next: ExtensionInstallMetadata = {
    ...cur.value,
    manifest,
    installedVersion: manifest.version,
    updatedAt: new Date().toISOString(),
    state: 'installed',
  };
  return upsertInstalledExtension(deps.db, next);
}
