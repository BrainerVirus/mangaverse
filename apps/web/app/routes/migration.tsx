import { createFileRoute } from '@tanstack/react-router';

import { migrationSearchSchema, type MigrationSearch } from '../lib/migration-search.js';

export const Route = createFileRoute('/migration')({
  validateSearch: (search: Record<string, unknown>): MigrationSearch =>
    migrationSearchSchema.parse(search),
});
