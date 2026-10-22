import type { AppDrizzleDb } from '@app/db';
import type {
  ExtensionInstallMetadata,
  ExtensionRegistryEntry,
  ProviderManifest,
} from '@app/shared';
import { toExtensionInstallId, toProviderId } from '@app/shared';

import type { InstalledProviderSummary } from './types.js';

function summarizeInstalledProvider(provider: ExtensionInstallMetadata): InstalledProviderSummary {
  const enabledCapabilities = Object.values(provider.manifest.capabilities).filter(Boolean).length;
  return {
    id: provider.id,
    name: provider.manifest.name,
    version: provider.installedVersion,
    enabled: provider.enabled,
    health: provider.health,
    sourceUrl: provider.sourceUrl,
    languages: provider.manifest.languages,
    capabilityCount: enabledCapabilities,
  };
}

export async function fetchExtensionsPage(
  db: AppDrizzleDb,
): Promise<{ providers: InstalledProviderSummary[]; registries: ExtensionRegistryEntry[] }> {
  const [{ listInstalledProviders }, { listExtensionRegistries }] = await Promise.all([
    import('@app/extensions-core'),
    import('@app/db'),
  ]);
  const [result, registries] = await Promise.all([
    listInstalledProviders(db),
    listExtensionRegistries(db),
  ]);
  if (!result.ok) {
    throw result.error;
  }

  const providers = [...result.value.map(summarizeInstalledProvider)].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  registries.sort((a, b) => a.name.localeCompare(b.name));

  return { providers, registries };
}

const demoProviderManifest: ProviderManifest = {
  id: toProviderId('demo-provider'),
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://example.com/demo' },
  compatibility: { platforms: ['web', 'desktop'] },
  capabilities: {
    'discovery.search': true,
    'metadata.details': true,
    'metadata.chapters': true,
  },
  permissions: ['network.http', 'storage.local'],
  languages: ['en', 'es'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

export function demoInstallMetadata(
  overrides?: Partial<ExtensionInstallMetadata>,
): ExtensionInstallMetadata {
  const now = new Date().toISOString();
  return {
    id: toExtensionInstallId(String(demoProviderManifest.id)),
    manifest: demoProviderManifest,
    sourceUrl: 'https://example.com/demo/manifest.json',
    manifestUrl: 'https://example.com/demo/manifest.json',
    installedVersion: demoProviderManifest.version,
    enabled: true,
    installedAt: now,
    updatedAt: now,
    state: 'installed',
    health: 'ok',
    warnings: [],
    ...overrides,
  };
}
