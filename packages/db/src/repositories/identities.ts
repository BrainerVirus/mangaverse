import { and, eq, inArray } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  toMangaId,
  toProviderId,
  toProviderMappingId,
  toProviderMangaId,
  type MangaIdentity,
  type MangaPerson,
  type MangaProviderMapping,
  type MangaTag,
  type MangaTitle,
  type MangaId,
  type ProviderMappingId,
  type TrackingLink,
  type UserTitleOverride,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import {
  mangaIdentities,
  mangaPeople,
  mangaProviderMappings,
  mangaTagMemberships,
  mangaTags,
  mangaTitles,
  trackingLinks,
} from '../schema.js';

function newId(): string {
  return crypto.randomUUID();
}

interface IdentityRelations {
  readonly mappings: readonly (typeof mangaProviderMappings.$inferSelect)[];
  readonly titles: readonly (typeof mangaTitles.$inferSelect)[];
  readonly people: readonly (typeof mangaPeople.$inferSelect)[];
  readonly tags: readonly MangaTag[];
  readonly tracking: readonly (typeof trackingLinks.$inferSelect)[];
}

function buildMangaIdentity(
  row: typeof mangaIdentities.$inferSelect,
  relations: IdentityRelations,
): MangaIdentity {
  const alternativeTitles: MangaTitle[] = relations.titles.map((t) => ({
    value: t.value,
    ...(t.locale !== null && t.locale !== undefined && t.locale !== '' ? { locale: t.locale } : {}),
  }));

  const authors: MangaPerson[] = relations.people
    .filter((p) => p.kind === 'author')
    .map((p) => ({
      name: p.name,
      ...(p.role !== null && p.role !== undefined && p.role !== '' ? { role: p.role } : {}),
    }));
  const artists: MangaPerson[] = relations.people
    .filter((p) => p.kind === 'artist')
    .map((p) => ({
      name: p.name,
      ...(p.role !== null && p.role !== undefined && p.role !== '' ? { role: p.role } : {}),
    }));

  const providerMappings: MangaProviderMapping[] = relations.mappings.map((m) => ({
    id: toProviderMappingId(m.id),
    providerId: toProviderId(m.providerId),
    providerMangaId: toProviderMangaId(m.providerMangaId),
    ...(m.providerTitle !== null && m.providerTitle !== undefined && m.providerTitle !== ''
      ? { providerTitle: m.providerTitle }
      : {}),
    ...(m.providerUrl !== null && m.providerUrl !== undefined && m.providerUrl !== ''
      ? { providerUrl: m.providerUrl }
      : {}),
    ...(m.lastSyncedAt !== null && m.lastSyncedAt !== undefined && m.lastSyncedAt !== ''
      ? { lastSyncedAt: m.lastSyncedAt }
      : {}),
  }));

  const trackingLinksOut: TrackingLink[] = relations.tracking.map((t) => ({
    service: t.service,
    externalId: t.externalId,
    ...(t.externalUrl !== null && t.externalUrl !== undefined && t.externalUrl !== ''
      ? { externalUrl: t.externalUrl }
      : {}),
    ...(t.lastSyncedAt !== null && t.lastSyncedAt !== undefined && t.lastSyncedAt !== ''
      ? { lastSyncedAt: t.lastSyncedAt }
      : {}),
  }));

  const mergedFromIds =
    row.mergedFromIdsJson !== null && row.mergedFromIdsJson !== undefined
      ? row.mergedFromIdsJson.map((id) => toMangaId(id))
      : undefined;

  return {
    id: toMangaId(row.id),
    canonicalTitle: row.canonicalTitle,
    alternativeTitles,
    authors,
    artists,
    tags: [...relations.tags],
    status: row.status as MangaIdentity['status'],
    contentRating: row.contentRating as MangaIdentity['contentRating'],
    providerMappings,
    defaultProviderMappingId: toProviderMappingId(row.defaultProviderMappingId),
    merged: row.merged,
    ...(row.language !== null && row.language !== undefined && row.language !== ''
      ? { language: row.language }
      : {}),
    ...(row.description !== null && row.description !== undefined && row.description !== ''
      ? { description: row.description }
      : {}),
    ...(row.coverImageUrl !== null && row.coverImageUrl !== undefined && row.coverImageUrl !== ''
      ? { coverImageUrl: row.coverImageUrl }
      : {}),
    ...(row.preferredChapterSourceId !== null &&
    row.preferredChapterSourceId !== undefined &&
    row.preferredChapterSourceId !== ''
      ? { preferredChapterSourceId: toProviderMappingId(row.preferredChapterSourceId) }
      : {}),
    ...(row.userOverridesJson !== null && row.userOverridesJson !== undefined
      ? { userOverrides: row.userOverridesJson as UserTitleOverride }
      : {}),
    ...(mergedFromIds !== undefined && mergedFromIds.length > 0 ? { mergedFromIds } : {}),
    ...(trackingLinksOut.length > 0 ? { trackingLinks: trackingLinksOut } : {}),
    ...(row.createdAt !== null && row.createdAt !== undefined && row.createdAt !== ''
      ? { createdAt: row.createdAt }
      : {}),
    ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== ''
      ? { updatedAt: row.updatedAt }
      : {}),
  };
}

function groupByManga<T extends { readonly mangaId: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.mangaId);
    if (list === undefined) grouped.set(row.mangaId, [row]);
    else list.push(row);
  }
  return grouped;
}

/**
 * Batched identity read: seven queries for any number of ids instead of ~11 per
 * identity. Library and search both fan out to this.
 */
export async function getMangaIdentities(
  db: AppDrizzleDb,
  mangaIds: readonly MangaId[],
): Promise<MangaIdentity[]> {
  if (mangaIds.length === 0) return [];
  const ids = [...mangaIds];

  const rows = db.select().from(mangaIdentities).where(inArray(mangaIdentities.id, ids)).all();
  if (rows.length === 0) return [];
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const mappingsRows = db
    .select()
    .from(mangaProviderMappings)
    .where(inArray(mangaProviderMappings.mangaId, ids))
    .all();
  const titlesRows = db.select().from(mangaTitles).where(inArray(mangaTitles.mangaId, ids)).all();
  const peopleRows = db.select().from(mangaPeople).where(inArray(mangaPeople.mangaId, ids)).all();
  const tagMemberships = db
    .select({ mangaId: mangaTagMemberships.mangaId, tagId: mangaTagMemberships.tagId })
    .from(mangaTagMemberships)
    .where(inArray(mangaTagMemberships.mangaId, ids))
    .all();
  const tagIds = [...new Set(tagMemberships.map((membership) => membership.tagId))];
  const tagRows =
    tagIds.length === 0
      ? []
      : db.select().from(mangaTags).where(inArray(mangaTags.id, tagIds)).all();
  const trackingRows = db
    .select()
    .from(trackingLinks)
    .where(inArray(trackingLinks.mangaId, ids))
    .all();

  const mappingsByManga = groupByManga(mappingsRows);
  const titlesByManga = groupByManga(titlesRows);
  const peopleByManga = groupByManga(peopleRows);
  const trackingByManga = groupByManga(trackingRows);
  const tagById = new Map(tagRows.map((t) => [t.id, t]));
  const tagsByManga = new Map<string, MangaTag[]>();
  for (const membership of tagMemberships) {
    const tag = tagById.get(membership.tagId);
    if (tag === undefined) continue;
    const list = tagsByManga.get(membership.mangaId);
    const mapped: MangaTag = {
      id: tag.id,
      label: tag.label,
      ...(tag.namespace !== null && tag.namespace !== undefined && tag.namespace !== ''
        ? { namespace: tag.namespace }
        : {}),
    };
    if (list === undefined) tagsByManga.set(membership.mangaId, [mapped]);
    else list.push(mapped);
  }

  const identities: MangaIdentity[] = [];
  for (const id of ids) {
    const row = rowById.get(id);
    if (row === undefined) continue;
    identities.push(
      buildMangaIdentity(row, {
        mappings: mappingsByManga.get(id) ?? [],
        titles: titlesByManga.get(id) ?? [],
        people: peopleByManga.get(id) ?? [],
        tags: tagsByManga.get(id) ?? [],
        tracking: trackingByManga.get(id) ?? [],
      }),
    );
  }
  return identities;
}

export async function getMangaIdentity(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<MangaIdentity | undefined> {
  const identities = await getMangaIdentities(db, [mangaId]);
  return identities[0];
}

export interface CreateMangaIdentityInput {
  readonly canonicalTitle: string;
  readonly status: MangaIdentity['status'];
  readonly contentRating: MangaIdentity['contentRating'];
  readonly providerId: string;
  readonly providerMangaId: string;
  readonly language?: string;
}

export async function createMangaIdentityWithInitialMapping(
  db: AppDrizzleDb,
  input: CreateMangaIdentityInput,
): Promise<AppResult<{ mangaId: MangaId; mappingId: ProviderMappingId }>> {
  const mangaId = toMangaId(newId());
  const mappingId = toProviderMappingId(newId());
  const now = new Date().toISOString();

  const existing = db
    .select({ id: mangaProviderMappings.id })
    .from(mangaProviderMappings)
    .where(
      and(
        eq(mangaProviderMappings.providerId, input.providerId),
        eq(mangaProviderMappings.providerMangaId, input.providerMangaId),
      ),
    )
    .get();

  if (existing !== undefined) {
    return err(
      createAppError({
        code: 'db.identity.duplicate_mapping',
        message: 'A provider manga mapping already exists for this provider remote id.',
      }),
    );
  }

  await db.insert(mangaIdentities).values({
    id: mangaId,
    canonicalTitle: input.canonicalTitle,
    status: input.status,
    contentRating: input.contentRating,
    merged: false,
    defaultProviderMappingId: mappingId,
    ...(input.language !== undefined ? { language: input.language } : {}),
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(mangaProviderMappings).values({
    id: mappingId,
    mangaId,
    providerId: input.providerId,
    providerMangaId: input.providerMangaId,
  });

  return ok({ mangaId, mappingId });
}

export interface AddProviderMappingInput {
  readonly mangaId: MangaId;
  readonly providerId: string;
  readonly providerMangaId: string;
  readonly providerTitle?: string;
  readonly providerUrl?: string;
}

export async function addProviderMapping(
  db: AppDrizzleDb,
  input: AddProviderMappingInput,
): Promise<AppResult<ProviderMappingId>> {
  const existing = db
    .select({ id: mangaProviderMappings.id })
    .from(mangaProviderMappings)
    .where(
      and(
        eq(mangaProviderMappings.providerId, input.providerId),
        eq(mangaProviderMappings.providerMangaId, input.providerMangaId),
      ),
    )
    .get();

  if (existing !== undefined) {
    return err(
      createAppError({
        code: 'db.identity.duplicate_mapping',
        message: 'A provider manga mapping already exists for this provider remote id.',
      }),
    );
  }

  const mappingId = toProviderMappingId(newId());
  await db.insert(mangaProviderMappings).values({
    id: mappingId,
    mangaId: input.mangaId,
    providerId: input.providerId,
    providerMangaId: input.providerMangaId,
    ...(input.providerTitle !== undefined ? { providerTitle: input.providerTitle } : {}),
    ...(input.providerUrl !== undefined ? { providerUrl: input.providerUrl } : {}),
  });

  return ok(mappingId);
}

export async function setDefaultProviderMapping(
  db: AppDrizzleDb,
  mangaId: MangaId,
  mappingId: ProviderMappingId,
): Promise<AppResult<void>> {
  const mapping = db
    .select({ id: mangaProviderMappings.id })
    .from(mangaProviderMappings)
    .where(and(eq(mangaProviderMappings.id, mappingId), eq(mangaProviderMappings.mangaId, mangaId)))
    .get();

  if (mapping === undefined) {
    return err(
      createAppError({
        code: 'db.identity.mapping_not_found',
        message: 'Provider mapping does not exist for this manga.',
      }),
    );
  }

  await db
    .update(mangaIdentities)
    .set({ defaultProviderMappingId: mappingId, updatedAt: new Date().toISOString() })
    .where(eq(mangaIdentities.id, mangaId));

  return ok(undefined);
}

export async function markIdentityMerged(
  db: AppDrizzleDb,
  mangaId: MangaId,
  mergedFromIds: readonly MangaId[],
): Promise<void> {
  await db
    .update(mangaIdentities)
    .set({
      merged: true,
      mergedFromIdsJson: mergedFromIds.map((id) => id),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(mangaIdentities.id, mangaId));
}

export async function clearIdentityMergeMetadata(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<void> {
  await db
    .update(mangaIdentities)
    .set({
      merged: false,
      mergedFromIdsJson: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(mangaIdentities.id, mangaId));
}

export async function listMangaIdentities(db: AppDrizzleDb): Promise<MangaIdentity[]> {
  const rows = db.select({ id: mangaIdentities.id }).from(mangaIdentities).all();
  return getMangaIdentities(
    db,
    rows.map((row) => toMangaId(row.id)),
  );
}

/** Insert or update a manga identity and its provider mappings (metadata fields only). */
export async function upsertMangaIdentity(
  db: AppDrizzleDb,
  identity: MangaIdentity,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = db
    .select({ id: mangaIdentities.id })
    .from(mangaIdentities)
    .where(eq(mangaIdentities.id, identity.id))
    .get();

  if (existing === undefined) {
    await db.insert(mangaIdentities).values({
      id: identity.id,
      canonicalTitle: identity.canonicalTitle,
      status: identity.status,
      contentRating: identity.contentRating,
      merged: identity.merged,
      defaultProviderMappingId: identity.defaultProviderMappingId,
      ...(identity.language !== undefined ? { language: identity.language } : {}),
      ...(identity.description !== undefined ? { description: identity.description } : {}),
      ...(identity.coverImageUrl !== undefined ? { coverImageUrl: identity.coverImageUrl } : {}),
      createdAt: identity.createdAt ?? now,
      updatedAt: now,
    });
  } else {
    await db
      .update(mangaIdentities)
      .set({
        canonicalTitle: identity.canonicalTitle,
        status: identity.status,
        contentRating: identity.contentRating,
        ...(identity.description !== undefined ? { description: identity.description } : {}),
        ...(identity.coverImageUrl !== undefined ? { coverImageUrl: identity.coverImageUrl } : {}),
        updatedAt: now,
      })
      .where(eq(mangaIdentities.id, identity.id));
  }

  await Promise.all(
    identity.providerMappings.map(async (mapping) => {
      const mappingRow = db
        .select({ id: mangaProviderMappings.id })
        .from(mangaProviderMappings)
        .where(eq(mangaProviderMappings.id, mapping.id))
        .get();

      if (mappingRow === undefined) {
        await db.insert(mangaProviderMappings).values({
          id: mapping.id,
          mangaId: identity.id,
          providerId: mapping.providerId,
          providerMangaId: mapping.providerMangaId,
          ...(mapping.providerTitle !== undefined ? { providerTitle: mapping.providerTitle } : {}),
          ...(mapping.providerUrl !== undefined ? { providerUrl: mapping.providerUrl } : {}),
          lastSyncedAt: now,
        });
      } else {
        await db
          .update(mangaProviderMappings)
          .set({
            ...(mapping.providerTitle !== undefined
              ? { providerTitle: mapping.providerTitle }
              : {}),
            ...(mapping.providerUrl !== undefined ? { providerUrl: mapping.providerUrl } : {}),
            lastSyncedAt: now,
          })
          .where(eq(mangaProviderMappings.id, mapping.id));
      }
    }),
  );
}
