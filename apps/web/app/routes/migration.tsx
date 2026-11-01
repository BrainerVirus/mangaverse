import { createFileRoute, redirect } from '@tanstack/react-router';

import type { MigrationSearch } from '../lib/migration-search.js';

/** Old URL. Forwards the raw params: the target parses them and reports a bad link itself. */
export const Route = createFileRoute('/migration')({
  validateSearch: (search: Record<string, unknown>): MigrationSearch => {
    const { ids, sources, source } = search;
    return {
      ...(ids === undefined ? {} : { ids }),
      ...(sources === undefined ? {} : { sources }),
      ...(source === undefined ? {} : { source }),
    } as MigrationSearch;
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/advanced/migration', search, replace: true });
  },
});
