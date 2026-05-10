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

export async function getMangaIdentity(db: AppDrizzleDb, mangaId: MangaId): Promise<MangaIdentity | undefined> {
  const row = await db.select().from(mangaIdentities).where(eq(mangaIdentities.id, mangaId)).get();
  if (row === undefined) return undefined;

  const mappingsRows = await db
    .select()
    .from(mangaProviderMappings)
    .where(eq(mangaProviderMappings.mangaId, mangaId))
    .all();

  const titlesRows = await db.select().from(mangaTitles).where(eq(mangaTitles.mangaId, mangaId)).all();
  const peopleRows = await db.select().from(mangaPeople).where(eq(mangaPeople.mangaId, mangaId)).all();

  const tagMemberships = await db
    .select({ tagId: mangaTagMemberships.tagId })
    .from(mangaTagMemberships)
    .where(eq(mangaTagMemberships.mangaId, mangaId))
    .all();

  let tags: MangaTag[] = [];
  if (tagMemberships.length > 0) {
    const tagIds = tagMemberships.map((m) => m.tagId);
    const tagRows = await db.select().from(mangaTags).where(inArray(mangaTags.id, tagIds)).all();
    tags = tagRows.map((t) => ({
      id: t.id,
      label: t.label,
      ...(t.namespace !== null && t.namespace !== undefined && t.namespace !== ''
        ? { namespace: t.namespace }
        : {}),
    }));
  }

  const trackingRows = await db.select().from(trackingLinks).where(eq(trackingLinks.mangaId, mangaId)).all();

  const providerMappings: MangaProviderMapping[] = mappingsRows.map((m) => ({
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

  const alternativeTitles: MangaTitle[] = titlesRows.map((t) => ({
    value: t.value,
    ...(t.locale !== null && t.locale !== undefined && t.locale !== '' ? { locale: t.locale } : {}),
  }));

  const authors: MangaPerson[] = peopleRows
    .filter((p) => p.kind === 'author')
    .map((p) => ({
      name: p.name,
      ...(p.role !== null && p.role !== undefined && p.role !== '' ? { role: p.role } : {}),
    }));
  const artists: MangaPerson[] = peopleRows
    .filter((p) => p.kind === 'artist')
    .map((p) => ({
      name: p.name,
      ...(p.role !== null && p.role !== undefined && p.role !== '' ? { role: p.role } : {}),
    }));

  const trackingLinksOut: TrackingLink[] = trackingRows.map((t) => ({
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

  const identity: MangaIdentity = {
    id: toMangaId(row.id),
    canonicalTitle: row.canonicalTitle,
    alternativeTitles,
    authors,
    artists,
    tags,
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

  return identity;
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

  const existing = await db
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
  const existing = await db
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
  const mapping = await db
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

export async function clearIdentityMergeMetadata(db: AppDrizzleDb, mangaId: MangaId): Promise<void> {
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
  const rows = await db.select({ id: mangaIdentities.id }).from(mangaIdentities).all();
  const loaded = await Promise.all(rows.map((row) => getMangaIdentity(db, toMangaId(row.id))));
  return loaded.filter((x): x is MangaIdentity => x !== undefined);
}