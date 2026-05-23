import type { AppDrizzleDb } from '@app/db';
import {
  fetchAppSettings,
  fetchReaderSettings,
  settingsQueryKeys,
} from '@app/settings';
import { queryOptions } from '@tanstack/react-query';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-timing.js';

export function appSettingsQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db),
    staleTime: QUERY_STALE_TIMES.settings,
    gcTime: QUERY_GC_TIMES.settings,
  });
}

export function readerSettingsQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: settingsQueryKeys.reader(),
    queryFn: () => fetchReaderSettings(db),
    staleTime: QUERY_STALE_TIMES.settings,
    gcTime: QUERY_GC_TIMES.settings,
  });
}
