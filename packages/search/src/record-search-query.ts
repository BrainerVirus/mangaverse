import type { AppDrizzleDb } from '@app/db';

export async function recordSearchQuery(db: AppDrizzleDb, query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return;
  }

  const { appendSearchHistory } = await import('@app/db');
  await appendSearchHistory(db, { query: trimmed });
}
