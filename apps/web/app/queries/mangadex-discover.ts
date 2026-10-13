import type { AppDrizzleDb } from '@app/db/browser';
import type { ProviderCapabilityKey } from '@app/shared';
import type { DiscoverPageData, DiscoverSection } from '@app/search';

import { resolveInstalledProvider } from '../lib/provider-registry.js';
import { providerItemToMangaIdentity } from '../lib/mangadex-identity-mapping.js';

export type MangadexSectionId = 'latest' | 'popular';

export interface MangadexSectionDefinition {
  readonly id: MangadexSectionId;
  readonly title: string;
  readonly capability: ProviderCapabilityKey;
}

/** Only sections the provider's declared capabilities can serve. */
export const MANGADEX_SECTION_DEFINITIONS: readonly MangadexSectionDefinition[] = [
  { id: 'latest', title: 'Latest updates', capability: 'discovery.latest' },
  { id: 'popular', title: 'Popular', capability: 'discovery.popular' },
];

export const MANGADEX_SECTION_PAGE_SIZE = 24;
export const MANGADEX_SECTION_PREVIEW_SIZE = 6;

export function getEnabledMangadexSections(
  capabilities: Readonly<Record<string, boolean | undefined>>,
): readonly MangadexSectionDefinition[] {
  return MANGADEX_SECTION_DEFINITIONS.filter((section) => capabilities[section.capability] === true);
}

export function getMangadexSectionTitle(sectionId: string): string | null {
  return MANGADEX_SECTION_DEFINITIONS.find((section) => section.id === sectionId)?.title ?? null;
}

async function fetchSection(
  db: AppDrizzleDb,
  sectionId: MangadexSectionId,
  page: number,
  limit: number,
  signal?: AbortSignal,
) {
  const provider = await resolveInstalledProvider(db, 'mangadex');
  if (provider === null) {
    return null;
  }
  const ctx = {
    manifest: provider.manifest,
    providerId: 'mangadex',
    ...(signal !== undefined ? { signal } : {}),
  };
  const browse =
    sectionId === 'latest'
      ? provider.browseLatest?.bind(provider)
      : provider.browsePopular?.bind(provider);
  if (browse === undefined) {
    return null;
  }

  const result = await browse(ctx, { page });
  const items = result.items.slice(0, limit);
  return {
    results: items.map(providerItemToMangaIdentity),
    hasMore: result.hasMore ?? false,
  };
}

export interface MangadexSectionPage {
  readonly results: readonly ReturnType<typeof providerItemToMangaIdentity>[];
  readonly hasMore: boolean;
  readonly offset: number;
}

export async function fetchMangadexSectionPage(
  db: AppDrizzleDb,
  sectionId: MangadexSectionId,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<MangadexSectionPage> {
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const fetched = await fetchSection(db, sectionId, page, limit, signal);
  if (fetched === null) {
    return { results: [], hasMore: false, offset };
  }
  return { results: fetched.results, hasMore: fetched.hasMore, offset };
}

/**
 * Provider previews for the discover grid. Section failures are isolated: one
 * broken section never blanks the whole page.
 */
export async function fetchMangadexDiscoverData(
  db: AppDrizzleDb,
  signal?: AbortSignal,
): Promise<DiscoverPageData> {
  const provider = await resolveInstalledProvider(db, 'mangadex');
  if (provider === null) {
    return { providers: [] };
  }

  const enabled = getEnabledMangadexSections(provider.manifest.capabilities);
  const settled = await Promise.allSettled(
    enabled.map(async (section): Promise<DiscoverSection> => {
      const fetched = await fetchSection(db, section.id, 1, MANGADEX_SECTION_PREVIEW_SIZE, signal);
      return {
        id: section.id,
        title: section.title,
        capability: section.capability,
        results: fetched?.results ?? [],
      };
    }),
  );

  const sections = settled
    .filter((result): result is PromiseFulfilledResult<DiscoverSection> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((section) => section.results.length > 0);

  return {
    providers: [
      {
        providerId: 'mangadex',
        providerName: provider.manifest.name,
        sections,
      },
    ],
  };
}
