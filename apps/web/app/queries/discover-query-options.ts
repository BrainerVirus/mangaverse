import type { AppDrizzleDb } from '@app/db';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { discoverQueryKeys } from '@/features/search';
import { fetchAppSettings, settingsQueryKeys } from '@/features/settings';
import { fetchDiscoverProviders, fetchProviderSectionPreview } from './provider-discover.js';

/**
 * Discover's settings read. A failure must not disable the page (it shows safe content and an
 * inline Retry), so there is no retry to sit through first.
 */
export function discoverSettingsQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db),
    retry: false,
  });
}

export function discoverProvidersQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: discoverQueryKeys.providers(),
    queryFn: () => fetchDiscoverProviders(db),
    meta: { feedback: { surface: 'inline' } },
    retry: false,
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
    meta: { feedback: { surface: 'inline' } },
  });
}

/**
 * The route loader's half of Discover: the settings and provider reads, then the previews of the
 * provider the page will open on, into the same cache entries the page reads. An expanded section
 * reads its own paged query, so only the feed is warmed.
 */
export async function warmDiscover(
  queryClient: QueryClient,
  db: AppDrizzleDb,
  search: { readonly provider?: string | undefined; readonly section?: string | undefined },
): Promise<void> {
  const [explicitContent, providers] = await Promise.all([
    // The page runs with safe content when settings fail; the warm-up does the same.
    queryClient.ensureQueryData(discoverSettingsQueryOptions(db)).then(
      (data) => data.settings.explicitContent,
      () => false,
    ),
    queryClient.ensureQueryData(discoverProvidersQueryOptions(db)),
  ]);
  if (search.section !== undefined) return;
  const active =
    providers.find((provider) => provider.providerId === search.provider) ?? providers[0];
  if (active === undefined) return;
  await Promise.all(
    active.sections.map((section) =>
      queryClient.ensureQueryData(
        discoverPreviewQueryOptions(db, active.providerId, section.id, explicitContent),
      ),
    ),
  );
}
