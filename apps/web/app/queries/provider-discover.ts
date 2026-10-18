import type { AppDrizzleDb } from '@app/db/browser';
import type { MangaIdentity } from '@app/shared';
import type { DiscoverPageData, DiscoverSection } from '@app/search';

import {
  listProviderBindings,
  resolveInstalledProvider,
  type ProviderAppBinding,
  type ProviderSectionDefinition,
} from '../lib/provider-registry.js';

export const PROVIDER_SECTION_PAGE_SIZE = 24;
export const PROVIDER_SECTION_PREVIEW_SIZE = 6;

/** Only sections the provider's declared capabilities can serve. */
export function getEnabledSections(
  binding: ProviderAppBinding,
  capabilities: Readonly<Record<string, boolean | undefined>>,
): readonly ProviderSectionDefinition[] {
  return binding.sections.filter((section) => capabilities[section.capability] === true);
}

export function getSectionTitle(binding: ProviderAppBinding, sectionId: string): string | null {
  return binding.sections.find((section) => section.id === sectionId)?.title ?? null;
}

async function fetchSection(
  db: AppDrizzleDb,
  binding: ProviderAppBinding,
  sectionId: string,
  page: number,
  limit: number,
  signal?: AbortSignal,
) {
  const section = binding.sections.find((entry) => entry.id === sectionId);
  if (section === undefined) {
    return null;
  }

  const provider = await resolveInstalledProvider(db, binding.providerId);
  if (provider === null) {
    return null;
  }
  const ctx = {
    manifest: provider.manifest,
    providerId: binding.providerId,
    ...(signal !== undefined ? { signal } : {}),
  };
  const browse = provider[section.browse]?.bind(provider);
  if (browse === undefined) {
    return null;
  }

  const result = await browse(ctx, { page });
  return {
    results: binding.toSearchIdentities(result.items.slice(0, limit)),
    hasMore: result.hasMore ?? false,
  };
}

export interface ProviderSectionPage {
  readonly results: readonly MangaIdentity[];
  readonly hasMore: boolean;
  readonly offset: number;
}

export async function fetchProviderSectionPage(
  db: AppDrizzleDb,
  binding: ProviderAppBinding,
  sectionId: string,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<ProviderSectionPage> {
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const fetched = await fetchSection(db, binding, sectionId, page, limit, signal);
  if (fetched === null) {
    return { results: [], hasMore: false, offset };
  }
  return { results: fetched.results, hasMore: fetched.hasMore, offset };
}

/**
 * Provider previews for the discover grid. Section failures are isolated: one
 * broken section never blanks the whole page.
 */
export async function fetchProviderDiscoverData(
  db: AppDrizzleDb,
  signal?: AbortSignal,
): Promise<DiscoverPageData> {
  const entries: DiscoverPageData['providers'][number][] = [];

  for (const binding of listProviderBindings()) {
    const provider = await resolveInstalledProvider(db, binding.providerId);
    if (provider === null) {
      continue;
    }

    const enabled = getEnabledSections(binding, provider.manifest.capabilities);
    const settled = await Promise.allSettled(
      enabled.map(async (section): Promise<DiscoverSection> => {
        const fetched = await fetchSection(
          db,
          binding,
          section.id,
          1,
          PROVIDER_SECTION_PREVIEW_SIZE,
          signal,
        );
        return {
          id: section.id,
          title: section.title,
          capability: section.capability,
          results: fetched?.results ?? [],
        };
      }),
    );

    const sections = settled
      .filter(
        (result): result is PromiseFulfilledResult<DiscoverSection> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((section) => section.results.length > 0);

    entries.push({
      providerId: binding.providerId,
      providerName: provider.manifest.name,
      sections,
    });
  }

  return { providers: entries };
}
