import { describe, expect, it, vi } from 'vitest';
import {
  listExtensionRegistries,
  listInstalledExtensions,
  upsertInstalledExtension,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toExtensionInstallId, toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import {
  confirmExtensionImport,
  exportExtensionRegistryData,
  fetchExtensionRegistryDocumentFromUrl,
  importExtensionRegistry,
  parseExtensionImportDocument,
  parseExtensionRegistryDocument,
  prepareExtensionImport,
} from './registry-import';
import type { ExtensionRegistryImportDocument } from './registry-import';

const document: ExtensionRegistryImportDocument = {
  name: 'Main',
  registryUrl: 'https://reg.example/index.json',
  entries: [
    { name: 'A', manifestUrl: 'https://a.example/m.json' },
    { name: 'Bad', manifestUrl: 'file:///x' },
  ],
};

const manifest: ProviderManifest = {
  id: toProviderId('demo'),
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://demo.example' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

async function installDemo(options: { readonly withManifestUrl: boolean }) {
  const harness = await createSqlJsHarness();
  await upsertInstalledExtension(harness.db, {
    id: toExtensionInstallId('demo'),
    manifest,
    sourceUrl: 'https://demo.example/manifest.json',
    ...(options.withManifestUrl ? { manifestUrl: 'https://demo.example/manifest.json' } : {}),
    installedVersion: '1.0.0',
    enabled: true,
    installedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    state: 'installed',
    health: 'ok',
    warnings: [],
  });
  return harness;
}

describe('parseExtensionRegistryDocument', () => {
  it('previews normalized entries and warnings without persisting anything', async () => {
    const { db } = await createSqlJsHarness();

    const result = parseExtensionRegistryDocument(document);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected preview');
    expect(result.value.registry.registryUrl).toBe(document.registryUrl);
    expect(result.value.entries).toHaveLength(1);
    expect(result.value.warnings).toHaveLength(1);
    expect(await listExtensionRegistries(db)).toEqual([]);
  });

  it('rejects a document with a non-http registry URL', () => {
    const result = parseExtensionRegistryDocument({
      ...document,
      registryUrl: 'file:///tmp/index.json',
    });
    expect(result.ok).toBe(false);
  });
});

describe('importExtensionRegistry', () => {
  it('rejects file registry document URL', async () => {
    const { db } = await createSqlJsHarness();
    const r = await importExtensionRegistry(
      {
        document: {
          name: 'Bad',
          registryUrl: 'file:///tmp/index.json',
          entries: [],
        },
      },
      { db },
    );
    expect(r.ok).toBe(false);
  });

  it('persists registry and returns normalized entries', async () => {
    const { db } = await createSqlJsHarness();
    const r = await importExtensionRegistry({ document }, { db });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error('expected r.ok to be true');
    }
    expect(r.value.entries).toHaveLength(1);
    expect(r.value.warnings.length).toBeGreaterThan(0);
    expect(await listExtensionRegistries(db)).toHaveLength(1);
  });
});

describe('fetchExtensionRegistryDocumentFromUrl', () => {
  it('rejects a non-http URL before fetching', async () => {
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>();
    const result = await fetchExtensionRegistryDocumentFromUrl('file:///tmp/registry.json', {
      fetch,
    });
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches and previews a registry document', async () => {
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(JSON.stringify(document), { status: 200 }),
    );
    const result = await fetchExtensionRegistryDocumentFromUrl('https://reg.example/index.json', {
      fetch,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected preview');
    expect(result.value.entries).toHaveLength(1);
  });
});

describe('exportExtensionRegistryData', () => {
  it('exports installed registries and providers as JSON-safe data', async () => {
    const { db } = await createSqlJsHarness();
    await importExtensionRegistry({ document }, { db });
    await upsertInstalledExtension(db, {
      id: toExtensionInstallId('demo'),
      manifest: {
        ...manifest,
        source: { url: 'https://demo.example', manifestUrl: 'https://demo.example/manifest.json' },
      },
      sourceUrl: 'https://demo.example/manifest.json',
      manifestUrl: 'https://demo.example/manifest.json',
      registryUrl: 'https://reg.example/index.json',
      installedVersion: '1.0.0',
      enabled: true,
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: 'installed',
      health: 'ok',
      warnings: [],
    });

    const result = await exportExtensionRegistryData({ db });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected export');
    expect(result.value.version).toBe(2);
    expect(result.value.registries).toHaveLength(1);
    expect(result.value.providers).toEqual([
      {
        name: 'Demo Provider',
        sourceUrl: 'https://demo.example/manifest.json',
        manifestUrl: 'https://demo.example/manifest.json',
        installedVersion: '1.0.0',
        enabled: true,
        registryUrl: 'https://reg.example/index.json',
      },
    ]);
    expect(result.value.warnings).toEqual([]);
    expect(() => JSON.stringify(result.value)).not.toThrow();
  });

  it('warns about and omits the manifest URL of a pre-migration install', async () => {
    const { db } = await installDemo({ withManifestUrl: false });

    const result = await exportExtensionRegistryData({ db });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected export');
    expect(result.value.providers[0]?.manifestUrl).toBeUndefined();
    expect(result.value.warnings[0]?.code).toBe('extensions.core.export.missing_manifest_url');
  });

  it('reports a read failure instead of throwing', async () => {
    const failing = {
      select() {
        throw new Error('db offline');
      },
    } as never;
    const result = await exportExtensionRegistryData({ db: failing });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('extensions.core.registry.export_failed');
  });
});

describe('extension list import', () => {
  it('round-trips an exported provider and registry through preview, fetch and install', async () => {
    const { db } = await installDemo({ withManifestUrl: true });
    await importExtensionRegistry({ document }, { db });
    const exported = await exportExtensionRegistryData({ db });
    if (!exported.ok) throw new Error('expected export');

    // react-doctor-disable-next-line react-doctor/no-json-parse-stringify-clone -- the JSON round trip is the behavior under test: an export must survive serialization, which structuredClone would not prove
    const parsed = parseExtensionImportDocument(JSON.parse(JSON.stringify(exported.value)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('expected preview');
    expect(parsed.value.kind).toBe('extension-list');
    expect(parsed.value.warnings).toEqual([]);
    expect(parsed.value.registries).toHaveLength(1);

    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    );
    const prepared = await prepareExtensionImport(parsed.value, { fetch });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error('expected preparation');
    expect(prepared.value.sessions).toHaveLength(1);
    expect(prepared.value.sessions[0]?.session.preview?.providerName).toBe('Demo Provider');
    expect(prepared.value.sessions[0]?.session.preview?.manifestUrl).toBe(
      'https://demo.example/manifest.json',
    );

    const installed = await confirmExtensionImport(prepared.value, { db });
    expect(installed.ok).toBe(true);
    if (!installed.ok) throw new Error('expected import');
    expect(installed.value.installed).toEqual(['Demo Provider']);
    expect(installed.value.registries).toBe(1);
    expect(installed.value.warnings).toEqual([]);
    const rows = await listInstalledExtensions(db);
    expect(rows[0]?.manifestUrl).toBe('https://demo.example/manifest.json');
    expect(await listExtensionRegistries(db)).toHaveLength(1);
  });

  it('skips a provider without a manifest URL and warns instead of guessing', async () => {
    const { db } = await installDemo({ withManifestUrl: false });
    const exported = await exportExtensionRegistryData({ db });
    if (!exported.ok) throw new Error('expected export');

    const parsed = parseExtensionImportDocument(exported.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('expected preview');
    expect(parsed.value.providers[0]?.manifestUrl).toBeUndefined();
    expect(parsed.value.warnings).toHaveLength(1);
    expect(parsed.value.warnings[0]?.code).toBe('extensions.core.import.missing_manifest_url');

    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>();
    const prepared = await prepareExtensionImport(parsed.value, { fetch });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error('expected preparation');
    expect(prepared.value.sessions).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();

    const installed = await confirmExtensionImport(prepared.value, { db });
    expect(installed.ok).toBe(true);
    if (!installed.ok) throw new Error('expected import');
    expect(installed.value.installed).toEqual([]);
  });

  it('imports a version 1 export with the same provider mapping', () => {
    const parsed = parseExtensionImportDocument({
      version: 1,
      providers: [
        {
          name: 'Old Provider',
          sourceUrl: 'https://old.example',
          manifestUrl: 'https://old.example/manifest.json',
          installedVersion: '0.1.0',
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('expected preview');
    expect(parsed.value.providers).toEqual([
      {
        name: 'Old Provider',
        manifestUrl: 'https://old.example/manifest.json',
        installedVersion: '0.1.0',
        enabled: true,
      },
    ]);
  });

  it('keeps registry documents on the registry-only path', () => {
    const parsed = parseExtensionImportDocument(document);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('expected preview');
    expect(parsed.value.kind).toBe('registry');
    expect(parsed.value.registries[0]?.registryUrl).toBe('https://reg.example/index.json');
    expect(parsed.value.entries).toHaveLength(1);
  });
});
