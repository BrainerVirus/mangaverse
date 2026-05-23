import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, validateBackupDocument } from './backup';
import { getDefaultReaderSettings } from './reader-settings';

const baseManifest = {
  id: 'demo',
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

const minimalValidBackup = {
  schemaVersion: BACKUP_SCHEMA_VERSION,
  metadata: { createdAt: new Date().toISOString(), appVersion: '0.0.1' },
  library: [{ id: 'le1', mangaId: 'm1', favorite: false, categoryIds: [], status: 'reading', unreadCount: 0 }],
  mangaIdentities: [
    {
      id: 'm1',
      canonicalTitle: 'Test Manga',
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'unknown',
      contentRating: 'unknown',
      merged: false,
      providerMappings: [{ id: 'map1', providerId: 'p1', providerMangaId: 'pm1' }],
      defaultProviderMappingId: 'map1',
    },
  ],
  installedExtensions: [
    {
      id: 'ext1',
      manifest: baseManifest,
      sourceUrl: 'https://example.com/ext',
      installedVersion: '1.0.0',
      enabled: true,
      installedAt: new Date().toISOString(),
      state: 'installed',
      health: 'ok',
      warnings: [],
    },
  ],
  readerSettings: getDefaultReaderSettings(),
  providerSettings: { providerSnapshots: [{ providerId: 'p1', settings: { a: 1 } }] },
  themeSettings: { presetId: 'default', dark: false },
};

describe('backup document', () => {
  it('accepts a minimal valid v1 backup', () => {
    const res = validateBackupDocument(minimalValidBackup);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.schemaVersion).toBe(1);
      expect(res.value.library).toHaveLength(1);
    }
  });

  it('rejects wrong schema version', () => {
    const res = validateBackupDocument({ ...minimalValidBackup, schemaVersion: 2 });
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('rejects invalid reader settings', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      readerSettings: { ...getDefaultReaderSettings(), preloadAhead: -2 },
    });
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('rejects invalid extension manifest', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      installedExtensions: [
        {
          ...minimalValidBackup.installedExtensions[0],
          manifest: { ...baseManifest, languages: [] },
        },
      ],
    });
    expect(res.ok).toBe(false);
  });

  it('rejects incomplete manga identities', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      mangaIdentities: [
        {
          id: 'm1',
          providerMappings: [],
          defaultProviderMappingId: 'map1',
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((issue) => issue.path === 'mangaIdentities')).toBe(true);
  });

  it('collects multiple issues', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      readerSettings: { ...getDefaultReaderSettings(), minZoom: 0 },
      themeSettings: { presetId: '', dark: 'yes' },
    });
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBe(2);
  });
});
