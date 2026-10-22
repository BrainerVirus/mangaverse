import { describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '@app/db/testing';
import type { IdentityMatchProfile } from '@app/db';
import { toMangaId } from '@app/shared';
import {
  DUPLICATE_CANDIDATE_LIMIT,
  duplicateConfidence,
  findDuplicateCandidates,
  rankDuplicateCandidates,
  scoreDuplicateCandidate,
} from './duplicate-candidates.js';

function profile(overrides: Partial<IdentityMatchProfile> & { id: string }): IdentityMatchProfile {
  return {
    mangaId: toMangaId(overrides.id),
    canonicalTitle: overrides.canonicalTitle ?? overrides.id,
    titles: overrides.titles ?? [overrides.canonicalTitle ?? overrides.id],
    authors: overrides.authors ?? [],
    artists: overrides.artists ?? [],
    providerIds: overrides.providerIds ?? ['alpha'],
    merged: overrides.merged ?? false,
  };
}

const target = profile({
  id: 'target',
  canonicalTitle: 'Kuro no Shoukanshi',
  titles: ['Kuro no Shoukanshi', 'The Black Summoner'],
  authors: ['Author One'],
  artists: ['Artist One'],
});

describe('scoreDuplicateCandidate', () => {
  it('Given the same title with a shared author, When scoring, Then the candidate is high confidence', () => {
    const candidate = profile({
      id: 'candidate',
      canonicalTitle: 'Kuro no Shōukanshi',
      authors: ['Author One'],
      artists: ['Artist One'],
    });
    const scored = scoreDuplicateCandidate(target, candidate);
    expect(scored.score).toBe(1);
    expect(scored.matchedTitle).toBe('Kuro no Shōukanshi');
    expect(duplicateConfidence(scored.score)).toBe('high');
  });

  it('Given an exact title but no matching people, When scoring, Then the title alone still clears the threshold', () => {
    const scored = scoreDuplicateCandidate(
      target,
      profile({ id: 'candidate', canonicalTitle: 'Kuro no Shoukanshi' }),
    );
    expect(scored.score).toBe(0.8);
    expect(duplicateConfidence(scored.score)).toBe('high');
  });

  it('Given an alternate title match plus a shared artist, When scoring, Then alternatives count as evidence', () => {
    const scored = scoreDuplicateCandidate(
      target,
      profile({
        id: 'candidate',
        canonicalTitle: 'Black Summoner',
        titles: ['Black Summoner', 'The Black Summoner'],
        artists: ['Artist One'],
      }),
    );
    expect(scored.score).toBeGreaterThanOrEqual(0.99);
    expect(scored.matchedTitle).toBe('The Black Summoner');
  });

  it('Given only a token overlap with no shared people, When ranking, Then the weak candidate is dropped', () => {
    const candidates = rankDuplicateCandidates(target, [
      profile({ id: 'weak', canonicalTitle: 'Black Clover' }),
    ]);
    expect(candidates).toEqual([]);
  });
});

describe('rankDuplicateCandidates', () => {
  it('Given self, merged and mapping-less rows, When ranking, Then they are excluded and the rest are capped', () => {
    const candidates = [
      profile({ id: 'target', canonicalTitle: 'Kuro no Shoukanshi' }),
      profile({ id: 'merged', canonicalTitle: 'Kuro no Shoukanshi', merged: true }),
      profile({ id: 'no-mapping', canonicalTitle: 'Kuro no Shoukanshi', providerIds: [] }),
      ...Array.from({ length: 8 }, (_, index) =>
        profile({ id: `dupe-${index}`, canonicalTitle: 'Kuro no Shoukanshi' }),
      ),
    ];
    const ranked = rankDuplicateCandidates(target, candidates);
    expect(ranked).toHaveLength(DUPLICATE_CANDIDATE_LIMIT);
    expect(ranked.map((candidate) => candidate.mangaId)).not.toContain('target');
    expect(ranked.map((candidate) => candidate.mangaId)).not.toContain('merged');
    expect(ranked.map((candidate) => candidate.mangaId)).not.toContain('no-mapping');
    expect(ranked[0]?.providerIds).toEqual(['alpha']);
  });

  it('Given equal scores, When ranking, Then the title and id order make the list stable', () => {
    const ranked = rankDuplicateCandidates(target, [
      profile({ id: 'b', canonicalTitle: 'Kuro no Shoukanshi' }),
      profile({ id: 'a', canonicalTitle: 'Kuro no Shoukanshi' }),
    ]);
    expect(ranked.map((candidate) => candidate.mangaId)).toEqual(['a', 'b']);
  });

  it('Given a zero limit, When ranking, Then the list is empty', () => {
    expect(
      rankDuplicateCandidates(
        target,
        [profile({ id: 'dupe', canonicalTitle: 'Kuro no Shoukanshi' })],
        {
          limit: 0,
        },
      ),
    ).toEqual([]);
  });
});

describe('findDuplicateCandidates', () => {
  it('Given two local identities with the same title, When finding candidates, Then the other identity is returned without provider calls', async () => {
    const { db, raw } = await createSqlJsHarness();
    raw.run(`
      INSERT INTO manga_identities (id, canonical_title, status, content_rating, merged, default_provider_mapping_id)
      VALUES ('a', 'Kuro no Shoukanshi', 'ongoing', 'safe', 0, 'map-a'),
             ('b', 'Kuro no Shoukanshi', 'ongoing', 'safe', 0, 'map-b');
      INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id)
      VALUES ('map-a', 'a', 'alpha', 'remote-a'), ('map-b', 'b', 'beta', 'remote-b');
    `);
    const found = await findDuplicateCandidates(db, toMangaId('a'));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      mangaId: 'b',
      canonicalTitle: 'Kuro no Shoukanshi',
      providerIds: ['beta'],
      score: 0.8,
      confidence: 'high',
    });
    expect(await findDuplicateCandidates(db, toMangaId('missing'))).toEqual([]);
    raw.close();
  });
});
