/** Branded string IDs for manga domain. */

declare const mangaIdBrand: unique symbol;
export type MangaId = string & { readonly [mangaIdBrand]: typeof mangaIdBrand };

declare const providerIdBrand: unique symbol;
export type ProviderId = string & { readonly [providerIdBrand]: typeof providerIdBrand };

declare const providerMangaIdBrand: unique symbol;
export type ProviderMangaId = string & {
  readonly [providerMangaIdBrand]: typeof providerMangaIdBrand;
};

declare const providerMappingIdBrand: unique symbol;
export type ProviderMappingId = string & {
  readonly [providerMappingIdBrand]: typeof providerMappingIdBrand;
};

export function toMangaId(id: string): MangaId {
  return id as MangaId;
}

export function toProviderId(id: string): ProviderId {
  return id as ProviderId;
}

export function toProviderMangaId(id: string): ProviderMangaId {
  return id as ProviderMangaId;
}

export function toProviderMappingId(id: string): ProviderMappingId {
  return id as ProviderMappingId;
}

export type MangaStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';

export type ContentRating = 'unknown' | 'safe' | 'suggestive' | 'mature' | 'explicit';

export interface MangaTitle {
  readonly locale?: string;
  readonly value: string;
}

export interface MangaPerson {
  readonly name: string;
  readonly role?: string;
}

export interface MangaTag {
  readonly id?: string;
  readonly label: string;
  readonly namespace?: string;
}

export interface MangaProviderMapping {
  readonly id: ProviderMappingId;
  readonly providerId: ProviderId;
  readonly providerMangaId: ProviderMangaId;
  readonly providerTitle?: string;
  readonly providerUrl?: string;
  readonly lastSyncedAt?: string;
}

export interface UserTitleOverride {
  readonly title?: string;
  readonly coverImageUrl?: string;
  readonly rating?: number;
  readonly notes?: string;
}

export interface TrackingLink {
  readonly service: string;
  readonly externalId: string;
  readonly externalUrl?: string;
  readonly lastSyncedAt?: string;
}

export interface MangaIdentity {
  readonly id: MangaId;
  /** Primary canonical title for display. */
  readonly canonicalTitle: string;
  /** All known titles (canonical + alternatives) across all providers. */
  readonly alternativeTitles: readonly MangaTitle[];
  readonly authors: readonly MangaPerson[];
  readonly artists: readonly MangaPerson[];
  readonly tags: readonly MangaTag[];
  readonly status: MangaStatus;
  readonly contentRating: ContentRating;
  /** Language of the manga content (ISO 639-1 or BCP-47). */
  readonly language?: string;
  readonly providerMappings: readonly MangaProviderMapping[];
  readonly defaultProviderMappingId: ProviderMappingId;
  /** Preferred provider mapping for reading chapters. */
  readonly preferredChapterSourceId?: ProviderMappingId;
  readonly description?: string;
  readonly coverImageUrl?: string;
  /** True when this identity was merged from multiple provider results. */
  readonly merged: boolean;
  /** IDs of identities absorbed into this one (for unmerge). */
  readonly mergedFromIds?: readonly MangaId[];
  /** User-applied overrides for title, cover, rating, notes. */
  readonly userOverrides?: UserTitleOverride;
  /** External tracking links (AniList, MAL, etc.). */
  readonly trackingLinks?: readonly TrackingLink[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function getDefaultProviderMapping(
  identity: MangaIdentity,
): MangaProviderMapping | undefined {
  return identity.providerMappings.find((m) => m.id === identity.defaultProviderMappingId);
}

export function getCanonicalTitle(identity: MangaIdentity): string {
  return identity.canonicalTitle;
}

export function getAlternativeTitles(identity: MangaIdentity): readonly string[] {
  return identity.alternativeTitles.map((t) => t.value);
}

export function getAllTitles(identity: MangaIdentity): readonly string[] {
  return [identity.canonicalTitle, ...identity.alternativeTitles.map((t) => t.value)];
}
