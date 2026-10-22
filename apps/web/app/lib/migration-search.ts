import { z } from 'zod';

/**
 * Library bulk migration hand-off: ids are the selected manga, sources are the
 * providers those titles read from. Non-arrays, empty ids and duplicates are
 * dropped so a hand-edited URL cannot widen or duplicate the batch.
 */
function normalizedIds(limit: number) {
  return z.preprocess((value) => {
    if (!Array.isArray(value)) return undefined;
    const ids = [
      ...new Set(
        value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    ];
    return ids.length === 0 ? undefined : ids.slice(0, limit);
  }, z.array(z.string()).max(limit).optional());
}

export const migrationSearchSchema = z.object({
  ids: normalizedIds(500),
  sources: normalizedIds(50),
  source: z.string().trim().optional(),
});

export type MigrationSearch = z.infer<typeof migrationSearchSchema>;
