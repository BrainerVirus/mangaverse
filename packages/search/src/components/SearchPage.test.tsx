/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MangaIdentity } from '@app/shared';
import { SearchPage } from './SearchPage.js';
import type { SearchPageData } from '../types.js';

function makeIdentity(title: string): MangaIdentity {
  return {
    id: `manga-${title}` as MangaIdentity['id'],
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [],
    defaultProviderMappingId: 'map-1' as MangaIdentity['defaultProviderMappingId'],
    merged: false,
  };
}

function makeData(query: string, titles: readonly string[] = []): SearchPageData {
  return {
    results: titles.map(makeIdentity),
    recentSearches: [],
    viewState: { query },
  };
}

describe('SearchPage', () => {
  it('fills the shell main instead of rendering a second main landmark', () => {
    const { container } = render(
      <SearchPage
        data={{ results: [], recentSearches: [], viewState: { query: '' } }}
        isLoading={false}
        isError={false}
        viewState={{ query: '' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Search' })).toBeInTheDocument();
  });

  it('keeps local results visible while providers are still searching', () => {
    render(
      <SearchPage
        data={makeData('berserk', ['Local Berserk'])}
        isLoading={false}
        isError={false}
        isProviderPending
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.getByRole('region', { name: 'Search results' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local Berserk' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Searching providers…');
    expect(screen.queryByText('No results found')).toBeNull();
  });

  it('delays the empty state until providers settle', () => {
    const { rerender } = render(
      <SearchPage
        data={makeData('berserk')}
        isLoading={false}
        isError={false}
        isProviderPending
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.queryByText('No results found')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Searching providers…');

    rerender(
      <SearchPage
        data={makeData('berserk')}
        isLoading={false}
        isError={false}
        isProviderPending={false}
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not announce a provider search for a blank query', () => {
    render(
      <SearchPage
        data={{
          results: [],
          recentSearches: [
            { id: 'recent-1', query: 'berserk', searchedAt: '2026-10-20T00:00:00Z' },
          ],
          viewState: { query: '' },
        }}
        isLoading={false}
        isError={false}
        isProviderPending
        viewState={{ query: '' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'berserk' })).toBeInTheDocument();
  });

  it('shows only the local loading state while local data is loading', () => {
    render(
      <SearchPage
        data={undefined}
        isLoading
        isError={false}
        isProviderPending
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.queryByRole('region', { name: 'Search results' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
