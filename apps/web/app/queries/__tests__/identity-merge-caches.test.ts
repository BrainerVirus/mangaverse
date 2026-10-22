import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { libraryQueryKeys } from '@app/library';
import { searchQueryKeys } from '@app/search';
import { invalidateIdentityMergeCaches } from '../manga-detail-route-helpers.js';

describe('invalidateIdentityMergeCaches', () => {
  it('Given a completed merge, When caches refresh, Then library, duplicate and local search surfaces are all invalidated', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    invalidateIdentityMergeCaches(client);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.allDuplicates() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: searchQueryKeys.all });
  });
});
