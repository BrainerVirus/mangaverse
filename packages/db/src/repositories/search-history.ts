import { desc } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { savedSearches, searchHistory } from '../schema.js';

export interface SearchHistoryEntry {
  readonly id: string;
  readonly query: string;
  readonly searchedAt: string;
  readonly providerId?: string;
}

export interface SavedSearchEntry {
  readonly id: string;
  readonly name: string;
  readonly query: string;
  readonly filter?: Record<string, unknown> | null;
  readonly createdAt?: string;
}

function newId(): string {
  return crypto.randomUUID();
}

export async function appendSearchHistory(
  db: AppDrizzleDb,
  input: { readonly query: string; readonly providerId?: string },
): Promise<void> {
  await db.insert(searchHistory).values({
    id: newId(),
    query: input.query,
    searchedAt: new Date().toISOString(),
    providerId: input.providerId,
  });
}

export async function listSearchHistory(db: AppDrizzleDb, limit: number): Promise<SearchHistoryEntry[]> {
  const rows = await db.select().from(searchHistory).orderBy(desc(searchHistory.searchedAt)).limit(limit).all();
  return rows.map((r) => ({
    id: r.id,
    query: r.query,
    searchedAt: r.searchedAt,
    ...(r.providerId !== null && r.providerId !== undefined && r.providerId !== '' ? { providerId: r.providerId } : {}),
  }));
}

export async function upsertSavedSearch(
  db: AppDrizzleDb,
  input: { readonly id?: string; readonly name: string; readonly query: string; readonly filter?: Record<string, unknown> },
): Promise<string> {
  const id = input.id ?? newId();
  const now = new Date().toISOString();
  await db
    .insert(savedSearches)
    .values({
      id,
      name: input.name,
      query: input.query,
      filterJson: input.filter ?? null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: savedSearches.id,
      set: {
        name: input.name,
        query: input.query,
        filterJson: input.filter ?? null,
      },
    });
  return id;
}

export async function listSavedSearches(db: AppDrizzleDb): Promise<SavedSearchEntry[]> {
  const rows = await db.select().from(savedSearches).all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    query: r.query,
    ...(r.filterJson !== null && r.filterJson !== undefined ? { filter: r.filterJson as Record<string, unknown> } : {}),
    ...(r.createdAt !== null && r.createdAt !== undefined && r.createdAt !== '' ? { createdAt: r.createdAt } : {}),
  }));
}

export async function countSearchHistory(db: AppDrizzleDb): Promise<number> {
  const rows = await db.select({ id: searchHistory.id }).from(searchHistory).all();
  return rows.length;
}

export async function countSavedSearches(db: AppDrizzleDb): Promise<number> {
  const rows = await db.select({ id: savedSearches.id }).from(savedSearches).all();
  return rows.length;
}

export async function clearSearchHistory(db: AppDrizzleDb): Promise<number> {
  const rows = await db.select({ id: searchHistory.id }).from(searchHistory).all();
  if (rows.length === 0) {
    return 0;
  }

  await db.delete(searchHistory);
  return rows.length;
}
