import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import type {
  ExtensionInstallWarning,
  ExtensionRegistryEntry,
  ProviderContentFlags,
} from '@app/shared';
import { validateRemoteManifestUrlForFetch } from '@app/extensions-sdk';
import { listExtensionRegistries, listInstalledExtensions, upsertExtensionRegistry } from '@app/db';
import type { AppDrizzleDb } from '@app/db';

import { fetchManifestFromUrl } from './manifest-fetch.js';
import type { ExtensionFetchEnvironment } from './manifest-fetch.js';
import type { RegistryProviderEntry } from './prepare-install.js';

export interface ExtensionRegistryImportDocument {
  readonly name: string;
  readonly registryUrl: string;
  readonly description?: string;
  readonly entries: readonly unknown[];
}

export interface ExtensionRegistryImportResult {
  readonly registry: ExtensionRegistryEntry;
  readonly entries: readonly RegistryProviderEntry[];
  readonly warnings: readonly ExtensionInstallWarning[];
}

export interface ExtensionRegistryExportEntry {
  readonly name: string;
  /** Install source; a bundled provider has no fetchable manifest URL. */
  readonly sourceUrl: string;
  readonly manifestUrl?: string;
  readonly installedVersion: string;
  readonly enabled: boolean;
  readonly registryUrl?: string;
}

export interface ExtensionRegistryExport {
  readonly version: 1;
  readonly exportedAt: string;
  readonly registries: readonly ExtensionRegistryEntry[];
  readonly providers: readonly ExtensionRegistryExportEntry[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateDocument(input: unknown): AppResult<ExtensionRegistryImportDocument> {
  if (!isPlainObject(input)) {
    return err(
      createAppError({
        code: 'extensions.core.registry.invalid',
        message: 'Registry document must be an object.',
      }),
    );
  }
  if (!isNonEmptyString(input['name'])) {
    return err(
      createAppError({
        code: 'extensions.core.registry.invalid',
        message: 'Registry name is required.',
      }),
    );
  }
  if (!isNonEmptyString(input['registryUrl'])) {
    return err(
      createAppError({
        code: 'extensions.core.registry.invalid',
        message: 'Registry URL is required.',
      }),
    );
  }
  if (!Array.isArray(input['entries'])) {
    return err(
      createAppError({
        code: 'extensions.core.registry.invalid',
        message: 'Registry entries must be an array.',
      }),
    );
  }
  return ok({
    name: String(input['name']),
    registryUrl: String(input['registryUrl']),
    ...(typeof input['description'] === 'string' ? { description: input['description'] } : {}),
    entries: input['entries'],
  });
}

function normalizeEntry(
  raw: unknown,
  index: number,
): { entry?: RegistryProviderEntry; warning?: ExtensionInstallWarning } {
  if (!isPlainObject(raw)) {
    return {
      warning: {
        code: 'extensions.core.registry.bad_entry',
        message: `Entry ${index} is not an object.`,
        severity: 'warning',
      },
    };
  }
  if (!isNonEmptyString(raw['name'])) {
    return {
      warning: {
        code: 'extensions.core.registry.bad_entry',
        message: `Entry ${index} is missing a provider name.`,
        severity: 'warning',
      },
    };
  }
  if (!isNonEmptyString(raw['manifestUrl'])) {
    return {
      warning: {
        code: 'extensions.core.registry.bad_entry',
        message: `Entry ${index} is missing a manifest URL.`,
        severity: 'warning',
      },
    };
  }
  const urlCheck = validateRemoteManifestUrlForFetch(String(raw['manifestUrl']));
  if (!urlCheck.ok) {
    return {
      warning: {
        code: 'extensions.core.registry.bad_entry',
        message: `Entry ${index} has invalid manifest URL: ${urlCheck.error.message}`,
        severity: 'warning',
      },
    };
  }

  let contentFlags: ProviderContentFlags | undefined;
  const cf = raw['contentFlags'];
  if (isPlainObject(cf)) {
    if (
      typeof cf['nsfw'] === 'boolean' &&
      typeof cf['suggestive'] === 'boolean' &&
      typeof cf['violence'] === 'boolean'
    ) {
      contentFlags = { nsfw: cf['nsfw'], suggestive: cf['suggestive'], violence: cf['violence'] };
    }
  }

  const entry: RegistryProviderEntry = {
    name: String(raw['name']),
    manifestUrl: urlCheck.value,
    ...(typeof raw['description'] === 'string' ? { description: raw['description'] } : {}),
    ...(typeof raw['publisher'] === 'string' ? { publisher: raw['publisher'] } : {}),
    ...(Array.isArray(raw['languages']) && raw['languages'].every(isNonEmptyString)
      ? { languages: raw['languages'] as string[] }
      : {}),
    ...(contentFlags !== undefined ? { contentFlags } : {}),
  };

  return { entry };
}

/**
 * Validates a registry document and normalizes its entries without touching the
 * database, so the UI can preview warnings before the user confirms.
 */
export function parseExtensionRegistryDocument(
  input: unknown,
): AppResult<ExtensionRegistryImportResult> {
  const docResult = validateDocument(input);
  if (!docResult.ok) return docResult;
  const doc = docResult.value;

  const registryUrlResult = validateRemoteManifestUrlForFetch(doc.registryUrl);
  if (!registryUrlResult.ok) {
    return err(registryUrlResult.error);
  }

  const entries: RegistryProviderEntry[] = [];
  const warnings: ExtensionInstallWarning[] = [];

  doc.entries.forEach((raw, index) => {
    const { entry, warning } = normalizeEntry(raw, index);
    if (warning) warnings.push(warning);
    if (entry) entries.push(entry);
  });

  return ok({
    registry: {
      name: doc.name,
      registryUrl: registryUrlResult.value,
      ...(doc.description !== undefined ? { description: doc.description } : {}),
    },
    entries,
    warnings,
  });
}

/** Fetches a registry document over http(s) and returns its preview. */
export async function fetchExtensionRegistryDocumentFromUrl(
  url: string,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<ExtensionRegistryImportResult>> {
  const fetched = await fetchManifestFromUrl(url, environment, 'registry');
  if (!fetched.ok) return fetched;
  return parseExtensionRegistryDocument(fetched.value.json);
}

export async function importExtensionRegistry(
  input: { readonly document: unknown },
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<ExtensionRegistryImportResult>> {
  const parsed = parseExtensionRegistryDocument(input.document);
  if (!parsed.ok) return parsed;

  await upsertExtensionRegistry(deps.db, parsed.value.registry);
  return parsed;
}

/** Serializes the installed registries and providers for a user-held export. */
export async function exportExtensionRegistryData(deps: {
  readonly db: AppDrizzleDb;
}): Promise<AppResult<ExtensionRegistryExport>> {
  try {
    const [registries, installed] = await Promise.all([
      listExtensionRegistries(deps.db),
      listInstalledExtensions(deps.db),
    ]);
    return ok({
      version: 1,
      exportedAt: new Date().toISOString(),
      registries,
      providers: installed.map((provider) => ({
        name: provider.manifest.name,
        sourceUrl: provider.sourceUrl,
        ...(provider.manifest.source.manifestUrl !== undefined
          ? { manifestUrl: provider.manifest.source.manifestUrl }
          : {}),
        installedVersion: provider.installedVersion,
        enabled: provider.enabled,
        ...(provider.registryUrl !== undefined ? { registryUrl: provider.registryUrl } : {}),
      })),
    });
  } catch (e) {
    return err(
      createAppError({
        code: 'extensions.core.registry.export_failed',
        message: 'Could not export installed extensions.',
        cause: e,
      }),
    );
  }
}
