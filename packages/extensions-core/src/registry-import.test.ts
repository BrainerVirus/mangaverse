import { describe, expect, it, vi } from 'vitest';
import { listExtensionRegistries, upsertInstalledExtension } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toExtensionInstallId, toProviderId } from '@app/shared';

import {
  exportExtensionRegistryData,
  fetchExtensionRegistryDocumentFromUrl,
  importExtensionRegistry,
  parseExtensionRegistryDocument,
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
        id: toProviderId('demo'),
        name: 'Demo Provider',
        version: '1.0.0',
        source: { url: 'https://demo.example', manifestUrl: 'https://demo.example/manifest.json' },
        compatibility: { platforms: ['web'] },
        capabilities: { 'discovery.search': true },
        permissions: ['network.http'],
        languages: ['en'],
        contentFlags: { nsfw: false, suggestive: false, violence: false },
      },
      sourceUrl: 'https://demo.example/manifest.json',
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
    expect(result.value.version).toBe(1);
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
    expect(() => JSON.stringify(result.value)).not.toThrow();
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
