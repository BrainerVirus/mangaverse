import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type {
  Chapter,
  ChapterPage,
  ChapterReadState,
  ChapterPageImageMeta,
  ReadingProgress,
} from './chapter';
import type { LibraryCategory, LibraryEntry, LibraryFilter, LibraryViewState } from './library';
import type { ExtensionInstallMetadata, ExtensionInstallWarning } from './extension-install';
import type { MangaIdentity, MangaProviderMapping, MangaTitle, TrackingLink } from './manga';
import type { ProviderCapabilityKey, ProviderCapabilityDetail } from './provider';

describe('domain shape compatibility (types)', () => {
  it('chapter and read-state shapes are compatible for reader flow', () => {
    expectTypeOf<Chapter['pages']>().toEqualTypeOf<readonly ChapterPage[]>();
    expectTypeOf<ChapterPage['image']>().toEqualTypeOf<ChapterPageImageMeta>();
    expectTypeOf<ChapterReadState['progress']>().toEqualTypeOf<ReadingProgress>();
  });

  it('library entry references manga and optional chapter', () => {
    expectTypeOf<LibraryEntry['mangaId']>().toEqualTypeOf<MangaIdentity['id']>();
    expectTypeOf<LibraryCategory['id']>().toEqualTypeOf<LibraryEntry['categoryIds'][number]>();
    expectTypeOf<LibraryViewState['filter']>().toEqualTypeOf<LibraryFilter>();
  });

  it('extension install metadata embeds manifest and warnings', () => {
    expectTypeOf<ExtensionInstallMetadata['warnings']>().toEqualTypeOf<readonly ExtensionInstallWarning[]>();
    expectTypeOf<ExtensionInstallMetadata['manifest']['capabilities']>().toEqualTypeOf<
      Partial<Record<ProviderCapabilityKey, boolean>>
    >();
  });

  it('manga identity default mapping id ties to a mapping entry', () => {
    expectTypeOf<MangaIdentity['defaultProviderMappingId']>().toEqualTypeOf<MangaProviderMapping['id']>();
  });

  it('manga identity alternativeTitles and canonicalTitle coexist', () => {
    expectTypeOf<MangaIdentity['alternativeTitles']>().toEqualTypeOf<readonly MangaTitle[]>();
    expectTypeOf<MangaIdentity['canonicalTitle']>().toEqualTypeOf<string>();
  });

  it('manga identity supports tracking links', () => {
    expectTypeOf<NonNullable<MangaIdentity['trackingLinks']>[number]>().toEqualTypeOf<TrackingLink>();
  });

  it('provider capability detail references valid keys', () => {
    expectTypeOf<ProviderCapabilityDetail['key']>().toEqualTypeOf<ProviderCapabilityKey>();
  });
});