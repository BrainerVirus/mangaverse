import { describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import {
  appendExtensionLog,
  clearExtensionLogs,
  countExtensionLogs,
  listExtensionLogs,
} from './extension-logs.js';

describe('extension log repository', () => {
  it('lists newest first and filters by provider and level', async () => {
    const { db } = await createSqlJsHarness();
    await appendExtensionLog(db, {
      providerId: 'a',
      level: 'info',
      code: 'one',
      message: 'first',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await appendExtensionLog(db, {
      providerId: 'a',
      level: 'error',
      code: 'two',
      message: 'second',
      details: { operation: 'search' },
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await appendExtensionLog(db, {
      providerId: 'b',
      level: 'warn',
      code: 'three',
      message: 'third',
      createdAt: '2026-01-03T00:00:00.000Z',
    });

    const all = await listExtensionLogs(db, { providerId: 'a' });
    expect(all.map((entry) => entry.code)).toEqual(['two', 'one']);
    expect(all[0]?.details).toEqual({ operation: 'search' });

    const errors = await listExtensionLogs(db, { providerId: 'a', level: 'error' });
    expect(errors.map((entry) => entry.code)).toEqual(['two']);

    const global = await listExtensionLogs(db, { limit: 10 });
    expect(global.map((entry) => entry.code)).toEqual(['three', 'two', 'one']);

    const counts = await countExtensionLogs(db, { providerId: 'a' });
    expect(counts).toEqual({ total: 2, info: 1, errors: 1, warnings: 0 });

    const healthPrefix = await listExtensionLogs(db, { providerId: 'a', codePrefix: 'tw' });
    expect(healthPrefix.map((entry) => entry.code)).toEqual(['two']);
  });

  it('keeps insertion order for entries written in the same millisecond', async () => {
    const { db } = await createSqlJsHarness();
    const createdAt = '2026-01-01T00:00:00.000Z';
    for (const code of ['first', 'second', 'third']) {
      await appendExtensionLog(db, {
        providerId: 'a',
        level: 'info',
        code,
        message: code,
        createdAt,
      });
    }

    const rows = await listExtensionLogs(db, { providerId: 'a' });
    expect(rows.map((entry) => entry.code)).toEqual(['third', 'second', 'first']);
  });

  it('retains only the newest per-provider entries', async () => {
    const { raw, db } = await createSqlJsHarness();
    // Bulk raw inserts keep the test fast; one append runs the retention prune.
    for (let index = 0; index < 505; index += 1) {
      raw.run(
        `INSERT INTO extension_logs (id, provider_id, level, code, message, created_at)
         VALUES (?, 'noisy', 'error', 'page-failed', ?, ?)`,
        [
          `old-${index}`,
          `failure ${index}`,
          new Date(1_700_000_000_000 + index * 1000).toISOString(),
        ],
      );
    }
    await appendExtensionLog(db, {
      providerId: 'noisy',
      level: 'error',
      code: 'page-failed',
      message: 'newest failure',
      createdAt: '2027-01-01T00:00:00.000Z',
    });

    const rows = await listExtensionLogs(db, {
      providerId: 'noisy',
      limit: 510,
    });
    expect(rows).toHaveLength(500);
    expect(rows[0]?.message).toBe('newest failure');
    expect(rows.map((entry) => entry.id)).not.toContain('old-0');
  });

  it('trims the global retention window on append', async () => {
    const { raw, db } = await createSqlJsHarness();
    for (let index = 0; index < 2001; index += 1) {
      raw.run(
        `INSERT INTO extension_logs (id, provider_id, level, code, message, created_at)
         VALUES (?, ?, 'info', 'old', 'old', ?)`,
        [
          `old-${index}`,
          `provider-${index}`,
          new Date(1_700_000_000_000 + index * 1000).toISOString(),
        ],
      );
    }
    await appendExtensionLog(db, {
      providerId: 'fresh',
      level: 'info',
      code: 'new',
      message: 'newest',
      createdAt: '2027-01-01T00:00:00.000Z',
    });

    const counts = await countExtensionLogs(db);
    expect(counts.total).toBe(2000);
    expect(counts.errors).toBe(0);
    expect(counts.warnings).toBe(0);
    const rows = await listExtensionLogs(db, { limit: 1 });
    expect(rows[0]?.message).toBe('newest');
    const oldest = await listExtensionLogs(db, { limit: 2005 });
    expect(oldest.map((entry) => entry.id)).not.toContain('old-0');
  });

  it('clears one provider without touching the others, and clears all', async () => {
    const { db } = await createSqlJsHarness();
    await appendExtensionLog(db, {
      providerId: 'a',
      level: 'info',
      code: 'a',
      message: 'a',
    });
    await appendExtensionLog(db, {
      providerId: 'b',
      level: 'info',
      code: 'b',
      message: 'b',
    });

    await clearExtensionLogs(db, 'a');
    expect(await listExtensionLogs(db, { providerId: 'a' })).toHaveLength(0);
    expect(await listExtensionLogs(db, { providerId: 'b' })).toHaveLength(1);

    await clearExtensionLogs(db);
    expect((await countExtensionLogs(db)).total).toBe(0);
  });
});
