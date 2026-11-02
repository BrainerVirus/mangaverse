import type { ProviderCapabilityKey } from '@app/shared';

export interface MangadexSectionDefinition {
  readonly id: string;
  readonly title: string;
  readonly capability: ProviderCapabilityKey;
  /** The provider browse method that serves this section. */
  readonly browse: 'browseLatest' | 'browsePopular';
}

/** Only sections the provider's declared capabilities can serve. */
export const MANGADEX_SECTION_DEFINITIONS: readonly MangadexSectionDefinition[] = [
  {
    id: 'latest',
    title: 'Latest updates',
    capability: 'discovery.latest',
    browse: 'browseLatest',
  },
  {
    id: 'popular',
    title: 'Popular',
    capability: 'discovery.popular',
    browse: 'browsePopular',
  },
];
