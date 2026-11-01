import { describe, expect, it, vi } from 'vitest';
import type { AppDrizzleDb } from '@app/db';
import { libraryQueryKeys } from '@app/library';
import type * as LibraryModule from '@app/library';
import { QueryClient } from '@tanstack/react-query';

vi.mock('@app/library', async (importOriginal) => ({
  ...(await importOriginal<typeof LibraryModule>()),
  readLibraryUpdateReport: vi.fn<() => Promise<undefined>>(async () => undefined),
}));

describe('library update report query', () => {
  it('Given no report was saved, When the query runs, Then it resolves null', async () => {
    const { libraryUpdateReportQueryOptions } =
      await import('../../queries/library-query-options.js');
    const client = new QueryClient();
    const report = await client.fetchQuery(libraryUpdateReportQueryOptions({} as AppDrizzleDb));

    expect(report).toBeNull();
    expect(client.getQueryState(libraryQueryKeys.updateReport())?.status).toBe('success');
  });
});
