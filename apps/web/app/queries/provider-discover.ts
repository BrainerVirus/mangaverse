import type { AppDrizzleDb } from '@app/db/browser';
import {
  applyExplicitContentGate,
  loadProviderSettings,
  recordProviderFailure,
} from '@app/extensions';
import type { ProviderContract } from '@app/extensions-sdk';
import { createAppError } from '@app/shared';
import type { MangaIdentity, ProviderSettingsValues } from '@app/shared';
import type { DiscoverSection } from '@/features/search';

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
/**
 * Discover is interactive: a silent 30s socket wait or a multi-minute rate-gate
 * park reads as a hung page. Bound the request and expose the gate's horizon
 * instead, so the user sees a typed "rate limited / timed out" row with Retry.
 */
const DISCOVER_REQUEST_TIMEOUT_MS = 15_000;
const DISCOVER_GATE_WAIT_MS = 2_000;

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
    timeoutMs: DISCOVER_REQUEST_TIMEOUT_MS,
    maxGateWaitMs: DISCOVER_GATE_WAIT_MS,
  };
  const browse = provider[section.browse]?.bind(provider);
  if (browse === undefined) {
    return null;
  }

  const result = await browse(ctx, { page, limit });
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

/** The installed-provider descriptors Discover needs before it asks for any section. */
export interface DiscoverProviderDescriptor {
  readonly providerId: string;
  readonly providerName: string;
  readonly sections: readonly ProviderSectionDefinition[];
}

/**
 * Reads the install table once and returns every enabled provider that can
 * serve at least one section. A broken provider or malformed manifest is
 * skipped; the rest of the strip still renders.
 */
export async function fetchDiscoverProviders(
  db: AppDrizzleDb,
): Promise<readonly DiscoverProviderDescriptor[]> {
  const installed = await readInstalledExtensions(db);
  const descriptors: DiscoverProviderDescriptor[] = [];
  for (const binding of listProviderBindings()) {
    try {
      const provider = resolveInstalledProviderFrom(installed, binding.providerId);
      if (provider === null) continue;
      const sections = getEnabledSections(binding, provider.manifest.capabilities);
      if (sections.length === 0) continue;
      descriptors.push({
        providerId: binding.providerId,
        providerName: provider.manifest.name,
        sections,
      });
    } catch {
      // A provider that throws while resolving, or ships a malformed manifest,
      // must not blank the whole feed.
    }
  }
  return descriptors;
}

async function fetchSectionPreviewFor(
  db: AppDrizzleDb,
  provider: ProviderContract,
  binding: ProviderAppBinding,
  section: ProviderSectionDefinition,
  signal: AbortSignal | undefined,
  explicitContent: boolean,
): Promise<DiscoverSection> {
  const settings = applyExplicitContentGate(
    await loadProviderSettings(db, binding.providerId),
    explicitContent,
  );
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
  if (fetched === null) {
    throw createAppError({
      code: 'extensions.discover.section_unavailable',
      message: 'That Discover section is not available for this provider.',
    });
  }
  return {
    id: section.id,
    title: section.title,
    capability: section.capability,
    results: fetched.results,
    status: fetched.results.length > 0 ? 'ok' : 'empty',
  };
}

/**
 * One section's six-cover preview, its own query. Keyed separately from the
 * paged `section` query so a preview retry never refetches loaded pages.
 */
export async function fetchProviderSectionPreview(
  db: AppDrizzleDb,
  providerId: string,
  sectionId: string,
  signal?: AbortSignal,
  explicitContent = false,
): Promise<DiscoverSection> {
  const binding = listProviderBindings().find((entry) => entry.providerId === providerId);
  const section = binding?.sections.find((entry) => entry.id === sectionId);
  if (binding === undefined || section === undefined) {
    throw createAppError({
      code: 'extensions.discover.section_unavailable',
      message: 'That Discover section is not available for this provider.',
    });
  }
  const provider = await resolveInstalledProvider(db, providerId);
  if (provider === null) {
    throw createAppError({
      code: 'extensions.discover.provider_missing',
      message: 'This provider is not installed or is disabled.',
    });
  }
  return fetchSectionPreviewFor(db, provider, binding, section, signal, explicitContent);
}
