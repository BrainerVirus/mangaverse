import type { AppDrizzleDb } from '@app/db';
import { upsertInstalledExtension } from '@app/db';
import type { ProviderManifest } from '@app/shared';
import { toExtensionInstallId } from '@app/shared';
import { isMangaDexInstalled } from './dev-mangadex-search.js';

const DEV_MANIFEST_PATH = '/__dev/providers/mangadex/manifest.json';

export function getDevMangaDexManifestUrl(): string {
  if (typeof window === 'undefined') {
    return DEV_MANIFEST_PATH;
  }
  return `${window.location.origin}${DEV_MANIFEST_PATH}`;
}

/**
 * Registers the MangaDex dev provider in SQLite when missing (dev only).
 * Uses the Vite-served manifest from templates or `local-dev/`.
 */
export async function seedDevMangaDexProvider(db: AppDrizzleDb): Promise<void> {
  if (!import.meta.env.DEV) {
    return;
  }

  if (await isMangaDexInstalled(db)) {
    return;
  }

  const manifestUrl = getDevMangaDexManifestUrl();
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    console.warn(
      `[dev-seed] MangaDex manifest unavailable (${response.status}). Search will stay local-only.`,
    );
    return;
  }

  const manifest = (await response.json()) as ProviderManifest;
  const now = new Date().toISOString();
  const result = await upsertInstalledExtension(db, {
    id: toExtensionInstallId('mangadex'),
    manifest,
    sourceUrl: manifestUrl,
    installedVersion: manifest.version,
    enabled: true,
    installedAt: now,
    updatedAt: now,
    state: 'installed',
    health: 'ok',
    warnings: [],
  });

  if (!result.ok) {
    console.error('[dev-seed] Failed to register MangaDex provider:', result.error.message);
    return;
  }

  console.info('[dev-seed] MangaDex provider registered for local development.');
}
