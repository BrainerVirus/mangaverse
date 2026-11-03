// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import {
  foldForMatch,
  foldForSort,
  registerNodeSqliteFolds,
  registerSqlJsFolds,
  SQL_FOLD_MATCH,
  SQL_FOLD_SORT,
} from './sql-fold.js';

describe('sql folds', () => {
  it('Given an accented title, Then the folds are Unicode-aware and the sort fold drops accents', () => {
    expect(foldForMatch('Éclair')).toBe('éclair');
    expect(foldForSort('Éclair')).toBe('eclair');
    expect(foldForSort('  Éclair  ')).toBe('  eclair  ');
    expect(foldForMatch(null)).toBe('');
  });

  it('Given a node:sqlite connection, Then both folds are callable from SQL', () => {
    const database = new DatabaseSync(':memory:');
    registerNodeSqliteFolds(database);
    const row = database
      .prepare(`SELECT ${SQL_FOLD_MATCH}(?) AS matched, ${SQL_FOLD_SORT}(?) AS sorted`)
      .get('Éclair', 'Éclair') as { matched: string; sorted: string };
    expect(row).toEqual({ matched: 'éclair', sorted: 'eclair' });
    database.close();
  });

  it('Given a sql.js connection, Then both folds are callable from SQL', async () => {
    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    registerSqlJsFolds(raw as unknown as Parameters<typeof registerSqlJsFolds>[0]);
    const row = raw.exec(
      `SELECT ${SQL_FOLD_MATCH}('Éclair') AS matched, ${SQL_FOLD_SORT}('Éclair') AS sorted`,
    )[0];
    expect(row?.values).toEqual([['éclair', 'eclair']]);
    raw.close();
  });
});
