import type { AppResult } from '@app/shared';
import { createAppError, err, isPlainObject, ok } from '@app/shared';
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
import {
  prepareManualExtensionInstall,
  prepareRegistryExtensionInstall,
} from './prepare-install.js';
import { confirmExtensionInstall } from './confirm-install.js';
import { disableInstalledProvider } from './providers-ops.js';
import type { ExtensionInstallSession } from './install-types.js';

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
  /** Provider source page; informational only. */
  readonly sourceUrl: string;
  /** Manifest URL recorded at install; absent for bundled providers. */
  readonly manifestUrl?: string;
  readonly installedVersion: string;
  readonly enabled: boolean;
  readonly registryUrl?: string;
}

/**
 * Importable extension list document (version 2).
 *
 * ```json
 * {
 *   "version": 2,
 *   "exportedAt": "2026-10-22T00:00:00.000Z",
 *   "registries": [{ "name": "Main", "registryUrl": "https://example.com/index.json" }],
 *   "providers": [
 *     {
 *       "name": "Demo",
 *       "sourceUrl": "https://example.com",
 *       "manifestUrl": "https://example.com/manifest.json",
 *       "installedVersion": "1.0.0",
 *       "enabled": true,
 *       "registryUrl": "https://example.com/index.json"
 *     }
 *   ],
 *   "warnings": []
 * }
 * ```
 *
 * Import fetches and validates every manifest through the normal install path;
 * it never executes provider code. Providers without a recorded manifest URL
 * are listed in `warnings` and skipped. Version 1 documents are accepted.
 */
export interface ExtensionRegistryExport {
  readonly version: 2;
  readonly exportedAt: string;
  readonly registries: readonly ExtensionRegistryEntry[];
  readonly providers: readonly ExtensionRegistryExportEntry[];
  readonly warnings: readonly ExtensionInstallWarning[];
}

/** One provider from an extension list document, normalized for preview. */
export interface ExtensionListProviderEntry {
  readonly name: string;
  readonly manifestUrl?: string;
  readonly installedVersion?: string;
  readonly enabled: boolean;
  readonly registryUrl?: string;
}

export type ExtensionImportKind = 'registry' | 'extension-list';

export interface ExtensionImportPreview {
  readonly kind: ExtensionImportKind;
  readonly registries: readonly ExtensionRegistryEntry[];
  /** Provider entries from a registry document, never persisted. */
  readonly entries: readonly RegistryProviderEntry[];
  /** Providers from an extension list export, fetched only after review. */
  readonly providers: readonly ExtensionListProviderEntry[];
  readonly warnings: readonly ExtensionInstallWarning[];
}

export interface ExtensionListImportSession {
  readonly entry: ExtensionListProviderEntry;
  readonly session: ExtensionInstallSession;
}

export interface ExtensionListImportPreparation {
  readonly registries: readonly ExtensionRegistryEntry[];
  readonly sessions: readonly ExtensionListImportSession[];
  readonly warnings: readonly ExtensionInstallWarning[];
}

export interface ExtensionListImportResult {
  readonly installed: readonly string[];
  readonly registries: number;
  readonly warnings: readonly ExtensionInstallWarning[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
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

function normalizeRegistryMetadata(
  raw: unknown,
  index: number,
  warnings: ExtensionInstallWarning[],
): ExtensionRegistryEntry | undefined {
  if (!isPlainObject(raw)) {
    warnings.push({
      code: 'extensions.core.import.bad_registry',
      message: `Registry ${index} is not an object.`,
      severity: 'warning',
    });
    return undefined;
  }
  if (!isNonEmptyString(raw['name']) || !isNonEmptyString(raw['registryUrl'])) {
    warnings.push({
      code: 'extensions.core.import.bad_registry',
      message: `Registry ${index} needs a name and URL.`,
      severity: 'warning',
    });
    return undefined;
  }
  const urlCheck = validateRemoteManifestUrlForFetch(String(raw['registryUrl']));
  if (!urlCheck.ok) {
    warnings.push({
      code: 'extensions.core.import.bad_registry',
      message: `Registry ${index} has an invalid URL: ${urlCheck.error.message}`,
      severity: 'warning',
    });
    return undefined;
  }
  return {
    name: String(raw['name']),
    registryUrl: urlCheck.value,
    ...(typeof raw['description'] === 'string' ? { description: raw['description'] } : {}),
  };
}

function normalizeProviderEntry(
  raw: unknown,
  index: number,
  warnings: ExtensionInstallWarning[],
): ExtensionListProviderEntry | undefined {
  if (!isPlainObject(raw) || !isNonEmptyString(raw['name'])) {
    warnings.push({
      code: 'extensions.core.import.bad_provider',
      message: `Extension ${index} is missing a provider name.`,
      severity: 'warning',
    });
    return undefined;
  }

  const name = String(raw['name']);
  let manifestUrl: string | undefined;
  if (!isNonEmptyString(raw['manifestUrl'])) {
    warnings.push({
      code: 'extensions.core.import.missing_manifest_url',
      message: `${name} has no recorded manifest URL and will be skipped.`,
      severity: 'warning',
    });
  } else {
    const urlCheck = validateRemoteManifestUrlForFetch(String(raw['manifestUrl']));
    if (!urlCheck.ok) {
      warnings.push({
        code: 'extensions.core.import.bad_manifest_url',
        message: `${name} has an invalid manifest URL and will be skipped: ${urlCheck.error.message}`,
        severity: 'warning',
      });
    } else {
      manifestUrl = urlCheck.value;
    }
  }

  let registryUrl: string | undefined;
  if (isNonEmptyString(raw['registryUrl'])) {
    const registryCheck = validateRemoteManifestUrlForFetch(String(raw['registryUrl']));
    if (registryCheck.ok) registryUrl = registryCheck.value;
  }

  return {
    name,
    ...(manifestUrl !== undefined ? { manifestUrl } : {}),
    ...(typeof raw['installedVersion'] === 'string'
      ? { installedVersion: raw['installedVersion'] }
      : {}),
    enabled: raw['enabled'] !== false,
    ...(registryUrl !== undefined ? { registryUrl } : {}),
  };
}

function parseExtensionListDocument(
  input: Record<string, unknown>,
): AppResult<ExtensionImportPreview> {
  const version = input['version'];
  if (version !== 1 && version !== 2) {
    return err(
      createAppError({
        code: 'extensions.core.import.unsupported_version',
        message: 'Extension export version must be 1 or 2.',
      }),
    );
  }
  if (!Array.isArray(input['providers'])) {
    return err(
      createAppError({
        code: 'extensions.core.import.invalid',
        message: 'Extension export providers must be an array.',
      }),
    );
  }
  if (input['registries'] !== undefined && !Array.isArray(input['registries'])) {
    return err(
      createAppError({
        code: 'extensions.core.import.invalid',
        message: 'Extension export registries must be an array.',
      }),
    );
  }

  const warnings: ExtensionInstallWarning[] = [];
  const registries: ExtensionRegistryEntry[] = [];
  const registryRows = Array.isArray(input['registries']) ? input['registries'] : [];
  registryRows.forEach((raw, index) => {
    const registry = normalizeRegistryMetadata(raw, index, warnings);
    if (registry !== undefined) registries.push(registry);
  });

  const providers: ExtensionListProviderEntry[] = [];
  input['providers'].forEach((raw, index) => {
    const provider = normalizeProviderEntry(raw, index, warnings);
    if (provider !== undefined) providers.push(provider);
  });

  return ok({ kind: 'extension-list', registries, entries: [], providers, warnings });
}

/**
 * Accepts either a registry document or an installed-extension export and
 * normalizes it for preview. Neither form writes to the database here.
 */
export function parseExtensionImportDocument(input: unknown): AppResult<ExtensionImportPreview> {
  if (!isPlainObject(input)) {
    return err(
      createAppError({
        code: 'extensions.core.import.invalid',
        message: 'Import must be a JSON object.',
      }),
    );
  }
  if (Array.isArray(input['providers'])) {
    return parseExtensionListDocument(input);
  }
  if (Array.isArray(input['entries'])) {
    const parsed = parseExtensionRegistryDocument(input);
    if (!parsed.ok) return parsed;
    return ok({
      kind: 'registry',
      registries: [parsed.value.registry],
      entries: parsed.value.entries,
      providers: [],
      warnings: parsed.value.warnings,
    });
  }
  return err(
    createAppError({
      code: 'extensions.core.import.invalid',
      message:
        'Expected a registry (name, registryUrl, entries) or an extension export (version, providers).',
    }),
  );
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

/** Fetches a registry or extension export and keeps the raw document for import. */
export async function fetchExtensionImportDocumentFromUrl(
  url: string,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<{ document: unknown; preview: ExtensionImportPreview }>> {
  const fetched = await fetchManifestFromUrl(url, environment, 'import');
  if (!fetched.ok) return fetched;
  const preview = parseExtensionImportDocument(fetched.value.json);
  if (!preview.ok) return preview;
  return ok({ document: fetched.value.json, preview: preview.value });
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

/**
 * Fetches and validates every provider manifest in an extension export so the
 * user can review names, publishers, flags and sources before consenting.
 * Failures become warnings; nothing is written or executed.
 */
export async function prepareExtensionImport(
  preview: ExtensionImportPreview,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<ExtensionListImportPreparation>> {
  if (preview.kind !== 'extension-list') {
    return err(
      createAppError({
        code: 'extensions.core.import.not_extension_list',
        message: 'Only an extension export can install providers.',
      }),
    );
  }

  const sessions: ExtensionListImportSession[] = [];
  const warnings = [...preview.warnings];

  for (const entry of preview.providers) {
    if (entry.manifestUrl === undefined) continue;
    const prepared =
      entry.registryUrl !== undefined
        ? // react-doctor-disable-next-line react-doctor/async-await-in-loop -- prepares providers one at a time so an import does not fan out unbounded manifest fetches
          await prepareRegistryExtensionInstall(
            entry.registryUrl,
            { name: entry.name, manifestUrl: entry.manifestUrl },
            environment,
          )
        : await prepareManualExtensionInstall(entry.manifestUrl, environment);

    if (!prepared.ok) {
      warnings.push({
        code: prepared.error.code,
        message: prepared.error.message,
        severity: 'warning',
      });
      continue;
    }
    if (prepared.value.step === 'awaitingConfirmation') {
      sessions.push({ entry, session: prepared.value });
      continue;
    }
    warnings.push({
      code: prepared.value.lastError?.code ?? 'extensions.core.import.provider_skipped',
      message:
        prepared.value.lastError?.message ??
        `${entry.name} could not be reviewed and will be skipped.`,
      severity: 'warning',
    });
  }

  return ok({ registries: preview.registries, sessions, warnings });
}

/**
 * Persists the exported registry list and installs every reviewed provider
 * through the normal confirm flow. A failing provider is reported without
 * discarding the rest of the import.
 */
export async function confirmExtensionImport(
  preparation: ExtensionListImportPreparation,
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<ExtensionListImportResult>> {
  try {
    for (const registry of preparation.registries) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- upserts run in document order against one write lock; order is the existing behavior
      await upsertExtensionRegistry(deps.db, registry);
    }

    const warnings = [...preparation.warnings];
    const installed: string[] = [];
    for (const { entry, session } of preparation.sessions) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- one install at a time: each confirm writes through the normal flow and a failure becomes a warning for that entry
      const confirmed = await confirmExtensionInstall(session, deps);
      if (!confirmed.ok) {
        warnings.push({
          code: confirmed.error.code,
          message: `${entry.name}: ${confirmed.error.message}`,
          severity: 'warning',
        });
        continue;
      }
      if (!entry.enabled && session.manifest !== undefined) {
        const disabled = await disableInstalledProvider(session.manifest.id, deps);
        if (!disabled.ok) {
          warnings.push({
            code: disabled.error.code,
            message: `${entry.name}: ${disabled.error.message}`,
            severity: 'warning',
          });
        }
      }
      installed.push(entry.name);
    }

    return ok({ installed, registries: preparation.registries.length, warnings });
  } catch (e) {
    return err(
      createAppError({
        code: 'extensions.core.import.failed',
        message: 'Could not import extensions.',
        cause: e,
      }),
    );
  }
}

/**
 * Serializes installed registries and providers as the importable document
 * described by `ExtensionRegistryExport`. Providers installed before manifest
 * URLs were persisted are exported without one and flagged for skipping.
 */
export async function exportExtensionRegistryData(deps: {
  readonly db: AppDrizzleDb;
}): Promise<AppResult<ExtensionRegistryExport>> {
  try {
    const [registries, installed] = await Promise.all([
      listExtensionRegistries(deps.db),
      listInstalledExtensions(deps.db),
    ]);
    const warnings: ExtensionInstallWarning[] = [];
    const providers = installed.map((provider) => {
      if (provider.manifestUrl === undefined) {
        warnings.push({
          code: 'extensions.core.export.missing_manifest_url',
          message: `${provider.manifest.name} has no recorded manifest URL and will be skipped on import. Reinstall it from its manifest URL to include it.`,
          severity: 'warning',
        });
      }
      return {
        name: provider.manifest.name,
        sourceUrl: provider.sourceUrl,
        ...(provider.manifestUrl !== undefined ? { manifestUrl: provider.manifestUrl } : {}),
        installedVersion: provider.installedVersion,
        enabled: provider.enabled,
        ...(provider.registryUrl !== undefined ? { registryUrl: provider.registryUrl } : {}),
      };
    });

    return ok({
      version: 2,
      exportedAt: new Date().toISOString(),
      registries,
      providers,
      warnings,
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
