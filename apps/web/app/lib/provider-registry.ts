import type { AppDrizzleDb } from '@app/db/browser';
import { listInstalledExtensions } from '@app/db/browser';
import {
  buildMangaDetailData,
  createMangaDexProvider,
  isMangadexAppMangaId,
  MANGADEX_MANIFEST,
  MANGADEX_SECTION_DEFINITIONS,
  parseMangadexAppChapterId,
  parseMangadexAppMangaId,
  providerChapterToChapter,
  providerItemToMangaIdentity,
  toMangadexChapterPages,
} from '@app/extensions/mangadex';
import type {
  ProviderChapter,
  ProviderContract,
  ProviderDetails,
  ProviderPage,
  ProviderSearchResultItem,
  RequestGate,
} from '@app/extensions-sdk';
import { createRequestGate } from '@app/extensions-sdk';
import type { MangaDetailData } from '@/features/library';

import { createProviderFetch } from './provider-fetch.js';
import type {
  Chapter,
  ChapterId,
  ChapterPage,
  ExtensionInstallMetadata,
  MangaId,
  MangaIdentity,
  ProviderCapabilityKey,
} from '@app/shared';

/** A Discover section a provider package offers, tied to its declared capability. */
export interface ProviderSectionDefinition {
  readonly id: string;
  readonly title: string;
  readonly capability: ProviderCapabilityKey;
  readonly browse:
    | 'browseLatest'
    | 'browsePopular'
    | 'browseTrending'
    | 'browseRecent'
    | 'browseTopRated';
}

/**
 * What the app needs from a provider package: how its app ids relate to provider
 * ids, and how its SDK values map into the app's domain types. Provider logic
 * lives in the package; this table is registration only.
 */
export interface ProviderAppBinding {
  readonly providerId: string;
  readonly createProvider: () => ProviderContract;
  readonly sections: readonly ProviderSectionDefinition[];
  readonly isAppMangaId: (mangaId: MangaId) => boolean;
  readonly parseAppMangaId: (mangaId: MangaId) => string | null;
  readonly parseAppChapterId: (chapterId: ChapterId) => string | null;
  readonly toSearchIdentities: (
    items: readonly ProviderSearchResultItem[],
  ) => readonly MangaIdentity[];
  readonly toMangaDetailData: (
    providerMangaId: string,
    details: ProviderDetails,
    chapters: readonly ProviderChapter[],
  ) => MangaDetailData;
  readonly toChapter: (providerMangaId: string, chapter: ProviderChapter) => Chapter;
  readonly toChapterPages: (
    providerChapterId: string,
    pages: readonly ProviderPage[],
  ) => readonly ChapterPage[];
}

/**
 * The rate gate is per provider per device, not per contract: resolving a provider
 * builds a fresh contract for every call, so an instance-owned gate would reset the
 * budget on every request. The manifest's declared `ops.officialApi` pace is the
 * default; a user's `rateLimitOverrideRpm` is passed per request by the provider.
 */
const MANGADEX_DEFAULT_RPM =
  MANGADEX_MANIFEST.capabilityDetails?.find((detail) => detail.key === 'ops.officialApi')
    ?.rateLimitRpm ?? 40;
const providerGates = new Map<string, RequestGate>();

export function gateFor(providerId: string, defaultRequestsPerMinute: number): RequestGate {
  let gate = providerGates.get(providerId);
  if (gate === undefined) {
    gate = createRequestGate({ defaultRequestsPerMinute });
    providerGates.set(providerId, gate);
  }
  return gate;
}

const PROVIDER_BINDINGS: readonly ProviderAppBinding[] = [
  {
    providerId: 'mangadex',
    // Every provider HTTP call goes through main on desktop; the web adapter's
    // request method uses the page's own fetch. Both share this provider's gate.
    createProvider: () =>
      createMangaDexProvider({
        fetchImpl: createProviderFetch('mangadex'),
        gate: gateFor('mangadex', MANGADEX_DEFAULT_RPM),
      }),
    sections: MANGADEX_SECTION_DEFINITIONS,
    isAppMangaId: isMangadexAppMangaId,
    parseAppMangaId: parseMangadexAppMangaId,
    parseAppChapterId: parseMangadexAppChapterId,
    toSearchIdentities: (items) => items.map(providerItemToMangaIdentity),
    toMangaDetailData: buildMangaDetailData,
    toChapter: providerChapterToChapter,
    toChapterPages: toMangadexChapterPages,
  },
];

export function listProviderBindings(): readonly ProviderAppBinding[] {
  return PROVIDER_BINDINGS;
}

export function getProviderBinding(providerId: string): ProviderAppBinding | null {
  return PROVIDER_BINDINGS.find((binding) => binding.providerId === providerId) ?? null;
}

/** The binding that owns an app manga id, or null when no registered provider claims it. */
export function getBindingForMangaId(mangaId: MangaId): ProviderAppBinding | null {
  return PROVIDER_BINDINGS.find((binding) => binding.isAppMangaId(mangaId)) ?? null;
}

/** The binding that owns an app chapter id, or null when no registered provider claims it. */
export function getBindingForChapterId(chapterId: ChapterId): ProviderAppBinding | null {
  return PROVIDER_BINDINGS.find((binding) => binding.parseAppChapterId(chapterId) !== null) ?? null;
}

/** Reads the install table for a caller that resolves several providers at once. */
export function readInstalledExtensions(db: AppDrizzleDb): Promise<ExtensionInstallMetadata[]> {
  return listInstalledExtensions(db);
}

/** Resolves a runtime contract from an already-read install list. */
export function resolveInstalledProviderFrom(
  installed: readonly ExtensionInstallMetadata[],
  providerId: string,
): ProviderContract | null {
  const entry = installed.find((item) => String(item.manifest.id) === providerId && item.enabled);
  if (entry === undefined) {
    return null;
  }

  const binding = getProviderBinding(providerId);
  if (binding === null) {
    return null;
  }

  return binding.createProvider();
}

/**
 * Resolves the runtime contract for an installed and enabled provider.
 * Disabled or unknown providers resolve to null — no remote call may happen
 * through a provider the user turned off.
 */
export async function resolveInstalledProvider(
  db: AppDrizzleDb,
  providerId: string,
): Promise<ProviderContract | null> {
  return resolveInstalledProviderFrom(await listInstalledExtensions(db), providerId);
}
