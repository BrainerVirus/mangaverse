import type { AppDrizzleDb } from '@app/db/browser';
import {
  applyExplicitContentGate,
  loadProviderSettings,
  recordProviderFailure,
} from '@app/extensions';
import type { ProviderContract } from '@app/extensions-sdk';
import type { MangaIdentity, ProviderSettingsValues } from '@app/shared';
import type { DiscoverPageData, DiscoverSection } from '@app/search';

import {
  listProviderBindings,
  readInstalledExtensions,
  resolveInstalledProvider,
  resolveInstalledProviderFrom,
  type ProviderAppBinding,
  type ProviderSectionDefinition,
} from '../lib/provider-registry.js';

export const PROVIDER_SECTION_PAGE_SIZE = 24;
const PROVIDER_SECTION_PREVIEW_SIZE = 6;

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
  provider: ProviderContract,
  binding: ProviderAppBinding,
  sectionId: string,
  page: number,
  limit: number,
  settings: ProviderSettingsValues,
  signal?: AbortSignal,
) {
  const section = binding.sections.find((entry) => entry.id === sectionId);
  if (section === undefined) {
    return null;
  }

  const ctx = {
    manifest: provider.manifest,
    providerId: binding.providerId,
    settings,
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
  explicitContent = false,
): Promise<ProviderSectionPage> {
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const provider = await resolveInstalledProvider(db, binding.providerId);
  if (provider === null) {
    return { results: [], hasMore: false, offset };
  }
  const settings = applyExplicitContentGate(
    await loadProviderSettings(db, binding.providerId),
    explicitContent,
  );
  const fetched = await fetchSection(
    provider,
    binding,
    sectionId,
    page,
    limit,
    settings,
    signal,
  ).catch(async (error: unknown) => {
    await recordProviderFailure(db, {
      providerId: binding.providerId,
      operation: 'discover',
      error,
      ...(signal !== undefined ? { signal } : {}),
    });
    throw error;
  });
  if (fetched === null) {
    return { results: [], hasMore: false, offset };
  }
  return { results: fetched.results, hasMore: fetched.hasMore, offset };
}

/**
 * Provider previews for the discover grid. A failed install read rejects so the
 * route shows its error state; one broken provider or section is dropped and
 * never blanks the rest of the page.
 */
export async function fetchProviderDiscoverData(
  db: AppDrizzleDb,
  signal?: AbortSignal,
  explicitContent = false,
): Promise<DiscoverPageData> {
  const entries: DiscoverPageData['providers'][number][] = [];
  const installed = await readInstalledExtensions(db);

  for (const binding of listProviderBindings()) {
    let provider: ProviderContract;
    let providerName: string;
    let enabled: readonly ProviderSectionDefinition[];
    let settings: ProviderSettingsValues;
    // A provider that throws while resolving, or ships a malformed manifest,
    // must not blank the whole feed.
    try {
      const resolved = resolveInstalledProviderFrom(installed, binding.providerId);
      if (resolved === null) {
        continue;
      }
      provider = resolved;
      providerName = resolved.manifest.name;
      enabled = getEnabledSections(binding, resolved.manifest.capabilities);
      settings = applyExplicitContentGate(
        await loadProviderSettings(db, binding.providerId),
        explicitContent,
      );
    } catch {
      continue;
    }

    const settled = await Promise.allSettled(
      enabled.map(async (section): Promise<DiscoverSection> => {
        const fetched = await fetchSection(
          provider,
          binding,
          section.id,
          1,
          PROVIDER_SECTION_PREVIEW_SIZE,
          settings,
          signal,
        ).catch(async (error: unknown) => {
          await recordProviderFailure(db, {
            providerId: binding.providerId,
            operation: 'discover',
            error,
            ...(signal !== undefined ? { signal } : {}),
          });
          throw error;
        });
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
      providerName,
      sections,
    });
  }

  return { providers: entries };
}
