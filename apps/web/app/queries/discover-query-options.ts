import type { AppDrizzleDb } from '@app/db';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { discoverQueryKeys } from '@/features/search';
import { fetchAppSettings, settingsQueryKeys } from '@/features/settings';
import { warmRouteQuery } from '../lib/route-data.js';
import { fetchDiscoverProviders, fetchProviderSectionPreview } from './provider-discover.js';

/**
 * Discover's reads. None retries on its own and none reruns a failure when the page mounts: a
 * failure the route loader met reaches the page as its inline error with Retry, and only Retry,
 * or the next visit's loader, asks again.
 */

/**
 * The settings read. A failure must not disable the page (it shows safe content and an inline
 * Retry), so there is no retry to sit through first.
 */
export function discoverSettingsQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db),
    retry: false,
    retryOnMount: false,
  });
}

export function discoverProvidersQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: discoverQueryKeys.providers(),
    queryFn: () => fetchDiscoverProviders(db),
    meta: { feedback: { surface: 'inline' } },
    retry: false,
    retryOnMount: false,
  });
}

export function discoverPreviewQueryOptions(
  db: AppDrizzleDb,
  providerId: string,
  sectionId: string,
  explicitContent: boolean,
) {
  return queryOptions({
    queryKey: discoverQueryKeys.preview(providerId, sectionId, explicitContent),
    queryFn: ({ signal }) =>
      fetchProviderSectionPreview(db, providerId, sectionId, signal, explicitContent),
    retry: false,
    retryOnMount: false,
    meta: { feedback: { surface: 'inline' } },
  });
}

/**
 * The route loader's half of Discover: the settings and provider reads, then the previews of the
 * provider the page will open on, into the same cache entries the page reads. An expanded section
 * reads its own paged query, so only the feed is warmed. An abandoned loader (`signal`) starts no
 * preview and stops the ones no page shows yet.
 */
export async function warmDiscover(
  queryClient: QueryClient,
  db: AppDrizzleDb,
  search: { readonly provider?: string | undefined; readonly section?: string | undefined },
  signal?: AbortSignal,
): Promise<void> {
  const [explicitContent, providers] = await Promise.all([
    // The page runs with safe content when settings fail; the warm-up does the same.
    warmRouteQuery(queryClient, discoverSettingsQueryOptions(db), signal).then(
      (data) => data.settings.explicitContent,
      () => false,
    ),
    warmRouteQuery(queryClient, discoverProvidersQueryOptions(db), signal),
  ]);
  if (search.section !== undefined || signal?.aborted === true) return;
  const active =
    providers.find((provider) => provider.providerId === search.provider) ?? providers[0];
  if (active === undefined) return;
  await Promise.all(
    active.sections.map((section) =>
      warmRouteQuery(
        queryClient,
        discoverPreviewQueryOptions(db, active.providerId, section.id, explicitContent),
        signal,
      ),
    ),
  );
}
