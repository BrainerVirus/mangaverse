import type { AppDrizzleDb } from '@app/db';

/**
 * Records a query once its database session is usable. Passing the session
 * promise lets a query typed while the local DB is still opening reach history
 * instead of being dropped.
 */
export async function recordSearchQuery(
  db: AppDrizzleDb | Promise<AppDrizzleDb>,
  query: string,
): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return;
  }

  const [handle, { appendSearchHistory }] = await Promise.all([db, import('@app/db')]);
  await appendSearchHistory(handle, { query: trimmed });
}
