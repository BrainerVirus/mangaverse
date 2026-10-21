/** Bound IN queries below SQLite variable limits; deduplicate before splitting. */
export function readIdChunks<T extends string, R>(
  ids: readonly T[],
  read: (chunk: T[]) => R[],
): R[] {
  const unique = [...new Set(ids)];
  const rows: R[] = [];
  for (let offset = 0; offset < unique.length; offset += 500) {
    for (const row of read(unique.slice(offset, offset + 500))) rows.push(row);
  }
  return rows;
}
