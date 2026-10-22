import { describe, expect, it } from 'vitest';
import type { MigrationCandidate, MigrationProviderOption } from '@app/migration';

import {
  findUnavailableRequestedSourceProviderId,
  readHandoff,
  resolveRequestedCandidates,
  resolveSourceProviderId,
} from '../migration-handoff.js';

function candidate(mangaId: string): MigrationCandidate {
  return {
    mangaId,
    canonicalTitle: mangaId,
    sourceProviderMangaId: `${mangaId}-source`,
    sourceMappingId: `${mangaId}-mapping`,
    isDefaultProvider: true,
    isActiveProvider: true,
  };
}

const providers: readonly MigrationProviderOption[] = [
  { id: 'source', name: 'Source', enabled: true },
  { id: 'target', name: 'Target', enabled: true },
];

describe('readHandoff', () => {
  it('prefills a single source provider', () => {
    expect(readHandoff({ ids: ['m1'], sources: ['source'] })).toMatchObject({
      requestedMangaIds: ['m1'],
      requestedSourceProviderIds: ['source'],
      initialSourceProviderId: 'source',
    });
  });

  it('asks for a source when the selection spans providers', () => {
    const handoff = readHandoff({ ids: ['m1', 'm2'], sources: ['source', 'target'] });

    expect(handoff.initialSourceProviderId).toBeNull();
    expect(handoff.requestedSourceProviderIds).toEqual(['source', 'target']);
  });

  it('carries a rejected link without prefilling a batch', () => {
    expect(
      readHandoff({ sources: ['source'], handoffError: 'too-many', handoffIdCount: 201 }),
    ).toMatchObject({
      requestedMangaIds: [],
      initialSourceProviderId: null,
      handoffError: 'too-many',
      handoffIdCount: 201,
    });
  });
});

describe('resolveSourceProviderId', () => {
  it('drops an unavailable prefilled source once providers settle', () => {
    expect(resolveSourceProviderId('gone', providers, true)).toBeNull();
    expect(resolveSourceProviderId('gone', providers, false)).toBe('gone');
    expect(resolveSourceProviderId('source', providers, true)).toBe('source');
  });

  it('names the unavailable prefill only for a single requested source', () => {
    const base = { activeSourceProviderId: null, providers, providersSettled: true };

    expect(
      findUnavailableRequestedSourceProviderId({
        ...base,
        requestedSourceProviderIds: ['gone'],
      }),
    ).toBe('gone');
    expect(
      findUnavailableRequestedSourceProviderId({
        ...base,
        requestedSourceProviderIds: ['source', 'target'],
      }),
    ).toBeNull();
    expect(
      findUnavailableRequestedSourceProviderId({
        ...base,
        requestedSourceProviderIds: ['gone'],
        providersSettled: false,
      }),
    ).toBeNull();
    expect(
      findUnavailableRequestedSourceProviderId({
        ...base,
        activeSourceProviderId: 'source',
        requestedSourceProviderIds: ['gone'],
      }),
    ).toBeNull();
  });
});

describe('resolveRequestedCandidates', () => {
  const allCandidates = [candidate('m1'), candidate('m2'), candidate('m3')];
  const base = {
    requestedMangaIds: ['m1', 'm3'],
    allCandidates,
    candidatesLoaded: true,
    sourceUnavailable: false,
  };

  it('shows zero candidates until a source is chosen for a multi-source hand-off', () => {
    expect(resolveRequestedCandidates({ ...base, activeSourceProviderId: null })).toEqual({
      candidates: [],
      skippedRequestedIds: [],
    });
  });

  it('narrows to the requested ids and reports stale ids as skipped', () => {
    const result = resolveRequestedCandidates({
      ...base,
      requestedMangaIds: ['m1', 'gone'],
      activeSourceProviderId: 'source',
    });

    expect(result.candidates.map((item) => item.mangaId)).toEqual(['m1']);
    expect(result.skippedRequestedIds).toEqual(['gone']);
  });

  it('marks every requested id skipped when the prefilled source is unavailable', () => {
    expect(
      resolveRequestedCandidates({
        ...base,
        activeSourceProviderId: null,
        sourceUnavailable: true,
      }),
    ).toEqual({ candidates: [], skippedRequestedIds: ['m1', 'm3'] });
  });

  it('keeps the unfiltered candidates when no ids were handed over', () => {
    expect(
      resolveRequestedCandidates({
        ...base,
        requestedMangaIds: [],
        activeSourceProviderId: 'source',
      }),
    ).toEqual({ candidates: allCandidates, skippedRequestedIds: [] });
  });

  it('waits for candidates before calling requested ids stale', () => {
    const result = resolveRequestedCandidates({
      ...base,
      activeSourceProviderId: 'source',
      candidatesLoaded: false,
    });

    expect(result.candidates.map((item) => item.mangaId)).toEqual(['m1', 'm3']);
    expect(result.skippedRequestedIds).toEqual([]);
  });
});
