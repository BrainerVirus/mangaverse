import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, dedupeBackupLibrary, validateBackupDocument } from './backup';
import { toChapterId } from './chapter';
import { toCategoryId, toLibraryEntryId, type LibraryEntry } from './library';
import { toMangaId, toProviderMappingId } from './manga';
import { getDefaultAppSettings } from './app-settings';
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
  it('accepts a current v3 backup', () => {
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

  it('accepts a v2 backup without app settings and keeps the field absent', () => {
    const res = validateBackupDocument({ ...minimalValidBackup, schemaVersion: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error('expected res.ok to be true');
    }
    expect(res.value.appSettings).toBeUndefined();
  });

  it('accepts and validates app settings in a v3 backup', () => {
    const appSettings = { ...getDefaultAppSettings(), explicitContent: true };
    const res = validateBackupDocument({ ...minimalValidBackup, appSettings });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error('expected res.ok to be true');
    }
    expect(res.value.appSettings).toEqual(appSettings);
  });

  it('rejects malformed app settings and names the field', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      appSettings: { ...getDefaultAppSettings(), preferredLanguages: [] },
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((issue) => issue.path)).toContain('appSettings');
  });

  it('rejects an unknown schema version', () => {
    const res = validateBackupDocument({ ...minimalValidBackup, schemaVersion: 4 });
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

  it('accepts a v3 backup with pre-PR free-form shortcuts and defaults them', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      readerSettings: {
        ...getDefaultReaderSettings(),
        readingMode: 'vertical',
        pageLayout: 'double',
        fitMode: 'height',
        minZoom: 1.25,
        maxZoom: 4,
        verticalGapPx: 24,
        keyboardShortcuts: [
          { action: 'teleport', key: 'x' },
          { action: 'nextPage', key: 'Tab' },
        ],
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.readerSettings.keyboardShortcuts).toEqual([]);
    expect(res.value.readerSettings).toMatchObject({
      readingMode: 'vertical',
      pageLayout: 'double',
      fitMode: 'height',
      minZoom: 1.25,
      maxZoom: 4,
      verticalGapPx: 24,
    });
  });

  it('still rejects invalid non-shortcut fields in a legacy backup', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      readerSettings: {
        ...getDefaultReaderSettings(),
        preloadAhead: -2,
        keyboardShortcuts: [{ action: 'teleport', key: 'x' }],
      },
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((issue) => issue.path)).toContain('readerSettings');
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

  it('rejects incomplete manga identities with the failing field paths', () => {
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
    expect(res.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'mangaIdentities.0.canonicalTitle',
        'mangaIdentities.0.authors',
        'mangaIdentities.0.status',
      ]),
    );
  });

  it('collects issues from every failing section', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      readerSettings: { ...getDefaultReaderSettings(), minZoom: 0 },
      themeSettings: { presetId: '', dark: 'yes' },
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((issue) => issue.path.startsWith('readerSettings'))).toBe(true);
    expect(res.issues.some((issue) => issue.path.startsWith('themeSettings'))).toBe(true);
  });
});

describe('malformed nested backup data', () => {
  it('rejects authors: null instead of crashing restore', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      mangaIdentities: [{ ...minimalValidBackup.mangaIdentities[0], authors: null }],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((issue) => issue.path)).toContain('mangaIdentities.0.authors');
  });

  it('rejects a provider mapping without provider fields', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      mangaIdentities: [
        { ...minimalValidBackup.mangaIdentities[0], providerMappings: [{ id: 'pm1' }] },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'mangaIdentities.0.providerMappings.0.providerId',
        'mangaIdentities.0.providerMappings.0.providerMangaId',
      ]),
    );
  });

  it('rejects malformed library entry flags, status, count and categories', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      library: [
        {
          id: 'le1',
          mangaId: 'm1',
          favorite: 'yes',
          status: 'bogus',
          unreadCount: 'many',
          categoryIds: null,
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'library.0.favorite',
        'library.0.status',
        'library.0.unreadCount',
        'library.0.categoryIds',
      ]),
    );
  });

  it('rejects extension warnings that are not warning records', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      installedExtensions: [
        {
          ...minimalValidBackup.installedExtensions[0],
          warnings: [{ code: 'manifest.deprecated' }],
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((issue) => issue.path)).toContain(
      'installedExtensions.0.warnings.0.message',
    );
  });

  it('rejects a provider snapshot without a settings object', () => {
    const res = validateBackupDocument({
      ...minimalValidBackup,
      providerSettings: { providerSnapshots: [{ providerId: 'p1', settings: null }] },
    });
    expect(res.ok).toBe(false);
    expect(res.issues.map((issue) => issue.path)).toContain(
      'providerSettings.providerSnapshots.0.settings',
    );
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

function libraryEntry(id: string, overrides: Partial<Omit<LibraryEntry, 'id'>> = {}): LibraryEntry {
  return {
    id: toLibraryEntryId(id),
    mangaId: toMangaId('m1'),
    favorite: false,
    categoryIds: [],
    status: 'reading',
    unreadCount: 0,
    ...overrides,
  };
}

describe('dedupeBackupLibrary', () => {
  it('merges duplicate manga entries into the latest-updated keeper', () => {
    const keeper = libraryEntry('le-keeper', {
      favorite: false,
      categoryIds: [toCategoryId('c1'), toCategoryId('c2')],
      status: 'on_hold',
      unreadCount: 3,
      lastReadChapterId: toChapterId('ch-keeper'),
      activeProviderMappingId: toProviderMappingId('map-keeper'),
      progressPercent: 40,
      notes: '',
      addedAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    const loser = libraryEntry('le-loser', {
      favorite: true,
      categoryIds: [toCategoryId('c2'), toCategoryId('c3')],
      status: 'reading',
      unreadCount: 9,
      lastReadChapterId: toChapterId('ch-loser'),
      activeProviderMappingId: toProviderMappingId('map-loser'),
      progressPercent: 90,
      notes: 'loser note',
      addedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    });

    const result = dedupeBackupLibrary([keeper, loser]);

    expect(result.library).toEqual([
      {
        id: toLibraryEntryId('le-keeper'),
        mangaId: toMangaId('m1'),
        favorite: true,
        categoryIds: [toCategoryId('c1'), toCategoryId('c2'), toCategoryId('c3')],
        status: 'on_hold',
        unreadCount: 3,
        lastReadChapterId: toChapterId('ch-loser'),
        activeProviderMappingId: toProviderMappingId('map-keeper'),
        progressPercent: 90,
        notes: 'loser note',
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    expect(result.removedIds).toEqual([toLibraryEntryId('le-loser')]);
    expect(result.removedCount).toBe(1);
    expect(result.merges).toEqual([
      {
        mangaId: toMangaId('m1'),
        keptId: toLibraryEntryId('le-keeper'),
        removedIds: [toLibraryEntryId('le-loser')],
      },
    ]);
  });

  it('breaks equal updatedAt ties with the later addedAt', () => {
    const result = dedupeBackupLibrary([
      libraryEntry('le-a', {
        updatedAt: '2026-02-01T00:00:00.000Z',
        addedAt: '2026-01-01T00:00:00.000Z',
      }),
      libraryEntry('le-b', {
        updatedAt: '2026-02-01T00:00:00.000Z',
        addedAt: '2026-01-02T00:00:00.000Z',
      }),
    ]);

    expect(result.library[0]?.id).toBe(toLibraryEntryId('le-b'));
  });

  it('breaks full timestamp ties with the codepoint-smallest id', () => {
    const timestamp = '2026-02-01T00:00:00.000Z';
    const result = dedupeBackupLibrary([
      libraryEntry('le-z', { updatedAt: timestamp, addedAt: timestamp }),
      libraryEntry('le-a', { updatedAt: timestamp, addedAt: timestamp }),
    ]);

    expect(result.library[0]?.id).toBe(toLibraryEntryId('le-a'));
  });

  it('treats empty-string updatedAt and addedAt as absent', () => {
    const result = dedupeBackupLibrary([
      // Codepoint-smaller id, so it would win if '' counted as a timestamp.
      libraryEntry('le-empty', { updatedAt: '', addedAt: '' }),
      libraryEntry('le-real', { updatedAt: '', addedAt: '2026-01-01T00:00:00.000Z' }),
    ]);

    expect(result.library[0]?.id).toBe(toLibraryEntryId('le-real'));
  });

  it('treats an empty-string updatedAt as absent against an omitted one', () => {
    const result = dedupeBackupLibrary([
      // Codepoint-smaller id, so it wins only if '' is treated like an absent timestamp.
      libraryEntry('le-a'),
      libraryEntry('le-b', { updatedAt: '' }),
    ]);

    expect(result.library[0]?.id).toBe(toLibraryEntryId('le-a'));
  });

  it('falls back to addedAt when updatedAt is empty', () => {
    const result = dedupeBackupLibrary([
      libraryEntry('le-a', { updatedAt: '', addedAt: '2026-01-01T00:00:00.000Z' }),
      libraryEntry('le-b', { updatedAt: '', addedAt: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(result.library[0]?.id).toBe(toLibraryEntryId('le-b'));
  });

  it('fills a missing lastReadChapterId from an equal-progress entry', () => {
    const result = dedupeBackupLibrary([
      libraryEntry('le-keeper', {
        progressPercent: 60,
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
      libraryEntry('le-loser', {
        progressPercent: 60,
        lastReadChapterId: toChapterId('ch-60'),
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ]);

    expect(result.library[0]?.lastReadChapterId).toBe(toChapterId('ch-60'));
  });

  it('orders ids by codepoint, not locale collation', () => {
    // Collation sorts 'ä' with 'a' (before 'z'); codepoints put 'z' first.
    const timestamp = '2026-02-01T00:00:00.000Z';
    const result = dedupeBackupLibrary([
      libraryEntry('le-z', { updatedAt: timestamp }),
      libraryEntry('le-ä', { updatedAt: timestamp }),
    ]);

    expect(result.library[0]?.id).toBe(toLibraryEntryId('le-z'));
  });

  it('keeps the keeper notes when they are non-empty', () => {
    const result = dedupeBackupLibrary([
      libraryEntry('le-keeper', {
        notes: 'keeper note',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
      libraryEntry('le-loser', {
        notes: 'loser note',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ]);

    expect(result.library[0]?.notes).toBe('keeper note');
  });

  it('leaves unique manga entries untouched', () => {
    const entries = [
      libraryEntry('le-1', { mangaId: toMangaId('m1'), updatedAt: '2026-01-01T00:00:00.000Z' }),
      libraryEntry('le-2', { mangaId: toMangaId('m2'), updatedAt: '2026-01-02T00:00:00.000Z' }),
    ];

    const result = dedupeBackupLibrary(entries);

    expect(result.library).toEqual(entries);
    expect(result.removedIds).toEqual([]);
    expect(result.removedCount).toBe(0);
    expect(result.merges).toEqual([]);
  });
});
