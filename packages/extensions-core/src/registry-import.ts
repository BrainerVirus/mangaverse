import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import type { ExtensionInstallWarning, ExtensionRegistryEntry, ProviderContentFlags } from '@app/shared';
import { validateRemoteManifestUrlForFetch } from '@app/extensions-sdk';
import { upsertExtensionRegistry } from '@app/db';
import type { AppDrizzleDb } from '@app/db';

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

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateDocument(input: unknown): AppResult<ExtensionRegistryImportDocument> {
  if (!isPlainObject(input)) {
    return err(createAppError({ code: 'extensions.core.registry.invalid', message: 'Registry document must be an object.' }));
  }
  if (!isNonEmptyString(input['name'])) {
    return err(createAppError({ code: 'extensions.core.registry.invalid', message: 'Registry name is required.' }));
  }
  if (!isNonEmptyString(input['registryUrl'])) {
    return err(createAppError({ code: 'extensions.core.registry.invalid', message: 'Registry URL is required.' }));
  }
  if (!Array.isArray(input['entries'])) {
    return err(createAppError({ code: 'extensions.core.registry.invalid', message: 'Registry entries must be an array.' }));
  }
  return ok({
    name: String(input['name']),
    registryUrl: String(input['registryUrl']),
    ...(typeof input['description'] === 'string' ? { description: input['description'] } : {}),
    entries: input['entries'],
  });
}

function normalizeEntry(raw: unknown, index: number): { entry?: RegistryProviderEntry; warning?: ExtensionInstallWarning } {
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

export async function importExtensionRegistry(
  input: { readonly document: unknown },
  deps: { readonly db: AppDrizzleDb },
): Promise<AppResult<ExtensionRegistryImportResult>> {
  const docResult = validateDocument(input.document);
  if (!docResult.ok) return docResult;
  const doc = docResult.value;

  const registryUrlResult = validateRemoteManifestUrlForFetch(doc.registryUrl);
  if (!registryUrlResult.ok) {
    return err(registryUrlResult.error);
  }
  const normalizedRegistryUrl = registryUrlResult.value;

  const entries: RegistryProviderEntry[] = [];
  const warnings: ExtensionInstallWarning[] = [];

  doc.entries.forEach((raw, index) => {
    const { entry, warning } = normalizeEntry(raw, index);
    if (warning) warnings.push(warning);
    if (entry) entries.push(entry);
  });

  const registry: ExtensionRegistryEntry = {
    name: doc.name,
    registryUrl: normalizedRegistryUrl,
    ...(doc.description !== undefined ? { description: doc.description } : {}),
  };

  await upsertExtensionRegistry(deps.db, registry);

  return ok({ registry, entries, warnings });
}
