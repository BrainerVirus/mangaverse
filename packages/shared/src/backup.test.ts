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
  library: [
    {
      id: 'le1',
      mangaId: 'm1',
      favorite: false,
      categoryIds: [],
      status: 'reading',
      unreadCount: 0,
    },
  ],
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
  it('accepts a current v2 backup', () => {
    const res = validateBackupDocument(minimalValidBackup);
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error('expected res.ok to be true');
    }
    expect(res.value.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(res.value.library).toHaveLength(1);
  });

  it('accepts a legacy v1 backup and maps presetId', () => {
    const res = validateBackupDocument({ ...minimalValidBackup, schemaVersion: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error('expected res.ok to be true');
    }
    expect(res.value.themeSettings.themeId).toBe('default');
    expect(res.value.themes).toEqual([]);
  });

  it('rejects an unknown schema version', () => {
    const res = validateBackupDocument({ ...minimalValidBackup, schemaVersion: 3 });
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

const customTheme = {
  schemaVersion: 1 as const,
  id: 'custom:backup',
  name: 'Backup Custom',
  basedOn: 'default',
  light: {
    seeds: {
      background: '#fafafa',
      foreground: '#1a1a1a',
      accent: '#f4f4f5',
      primary: '#18181b',
      surface: '#ffffff',
      border: '#e4e4e7',
      readerBackground: '#fafafa',
      destructive: '#ef4444',
      success: '#22c55e',
      warning: '#f59e0b',
    },
  },
  dark: {
    seeds: {
      background: '#09090b',
      foreground: '#fafafa',
      accent: '#27272a',
      primary: '#fafafa',
      surface: '#18181b',
      border: '#27272a',
      readerBackground: '#09090b',
      destructive: '#ef4444',
      success: '#22c55e',
      warning: '#f59e0b',
    },
  },
};

describe('theme document migration', () => {
  it('maps legacy presetId to themeId and defaults themes to empty', () => {
    const res = validateBackupDocument(minimalValidBackup);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.themeSettings).toEqual({ themeId: 'default', dark: false });
    expect(res.value.themes).toEqual([]);
  });

  it('keeps a custom theme definition in the validated document', () => {
    const res = validateBackupDocument({ ...minimalValidBackup, themes: [customTheme] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.themes[0]?.id).toBe('custom:backup');
  });

  it('reports the theme field path for an invalid seed', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      themes: [
        {
          ...customTheme,
          light: { ...customTheme.light, seeds: { ...customTheme.light.seeds, accent: '' } },
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((issue) => issue.path === 'themes.0.light.seeds.accent')).toBe(true);
  });

  it('rejects an override token outside the allow-list', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      themes: [
        {
          ...customTheme,
          light: {
            ...customTheme.light,
            overrides: { '--glass-stage': '#000000' },
          },
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(
      res.issues.some((issue) => issue.path === 'themes.0.light.overrides.--glass-stage'),
    ).toBe(true);
  });

  it('rejects a built-in id in the custom themes array', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      themes: [{ ...customTheme, id: 'sakura' }],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((issue) => issue.path === 'themes.0.id')).toBe(true);
  });

  it('keeps an allow-listed override', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      themes: [
        {
          ...customTheme,
          dark: {
            ...customTheme.dark,
            overrides: { '--ring': '#123456' },
          },
        },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it('rejects duplicate custom theme ids', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      themes: [customTheme, customTheme],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((issue) => issue.path === 'themes.1.id')).toBe(true);
  });
});
