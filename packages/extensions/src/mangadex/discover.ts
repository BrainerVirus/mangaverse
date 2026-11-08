import type { ProviderCapabilityKey } from '@app/shared';

export interface MangadexSectionDefinition {
  readonly id: string;
  readonly title: string;
  readonly capability: ProviderCapabilityKey;
  /** The provider browse method that serves this section. */
  readonly browse:
    | 'browseLatest'
    | 'browsePopular'
    | 'browseTrending'
    | 'browseRecent'
    | 'browseTopRated';
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
    id: 'trending',
    title: 'Trending this month',
    capability: 'discovery.browse',
    browse: 'browseTrending',
  },
  {
    id: 'popular',
    title: 'Popular',
    capability: 'discovery.popular',
    browse: 'browsePopular',
  },
  {
    id: 'recent',
    title: 'Recently added',
    capability: 'discovery.browse',
    browse: 'browseRecent',
  },
  {
    id: 'top-rated',
    title: 'Top rated',
    capability: 'discovery.browse',
    browse: 'browseTopRated',
  },
];
