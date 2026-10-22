export { MANGADEX_MANIFEST } from './manifest.js';
export {
  createMangaDexProvider,
  MANGADEX_API_BASE,
  type CreateMangaDexProviderOptions,
} from './provider.js';
export { MANGADEX_PAYLOAD_INVALID, payloadError } from './errors.js';
export type { MdAtHome, MdChapterEntity, MdMangaEntity } from './schemas.js';

// App-facing surface: the id conventions and SDK-value mapping the app needs so
// it can talk to this provider without knowing anything MangaDex-specific.
export {
  isMangadexAppMangaId,
  parseMangadexAppChapterId,
  parseMangadexAppMangaId,
  toMangadexAppChapterId,
  toMangadexAppMangaId,
} from './ids.js';
export {
  buildMangaDetailData,
  providerChapterToChapter,
  providerItemToMangaIdentity,
  toMangadexChapterPages,
} from './identity-mapping.js';
export { MANGADEX_SECTION_DEFINITIONS } from './discover.js';
export type { MangadexSectionDefinition } from './discover.js';
