/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MangaIdentity } from '@app/shared';
import { SearchPage } from './SearchPage.js';
import type { SearchPageData, SearchViewState } from '../types.js';

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

  it('shows a retryable provider-unavailable state when no local results match', () => {
    const onRetryProvider = vi.fn<() => void>();

    render(
      <SearchPage
        data={makeData('berserk')}
        isLoading={false}
        isError={false}
        isProviderError
        onRetryProvider={onRetryProvider}
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.getByText('Provider search unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No results found')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryProvider).toHaveBeenCalledTimes(1);
  });

  it('keeps local results and shows a quiet provider notice when providers fail', () => {
    render(
      <SearchPage
        data={makeData('berserk', ['Local Berserk'])}
        isLoading={false}
        isError={false}
        isProviderError
        onRetryProvider={() => {}}
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Local Berserk' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Provider search unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('Could not load search')).toBeNull();
    expect(screen.queryByText('No results found')).toBeNull();
  });

  it('does not surface a provider error for a blank query', () => {
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
        isProviderError
        onRetryProvider={() => {}}
        viewState={{ query: '' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Provider search unavailable')).toBeNull();
    expect(screen.getByRole('button', { name: 'berserk' })).toBeInTheDocument();
  });

  it('replaces the pending state with a provider-unavailable state, never a premature empty state', () => {
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

    rerender(
      <SearchPage
        data={makeData('berserk')}
        isLoading={false}
        isError={false}
        isProviderError
        onRetryProvider={() => {}}
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.queryByText('No results found')).toBeNull();
    expect(screen.getByText('Provider search unavailable')).toBeInTheDocument();
  });

  it('keeps the local load error ahead of any provider state', () => {
    render(
      <SearchPage
        data={makeData('berserk')}
        isLoading={false}
        isError
        isProviderError
        onRetryProvider={() => {}}
        viewState={{ query: 'berserk' }}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(screen.getByText('Could not load search')).toBeInTheDocument();
    expect(screen.queryByText('Provider search unavailable')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Given a selected provider, When All providers is clicked, Then the filter drops the provider', () => {
    const onViewStateChange = vi.fn<(next: SearchViewState) => void>();

    render(
      <SearchPage
        data={makeData('berserk')}
        isLoading={false}
        isError={false}
        providers={[{ providerId: 'prov-a', label: 'prov-a' }]}
        viewState={{ query: 'berserk', filters: { providerId: 'prov-a' } }}
        onViewStateChange={onViewStateChange}
        onOpenManga={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'All providers' }));

    expect(onViewStateChange).toHaveBeenCalledTimes(1);
    expect(onViewStateChange.mock.calls[0]?.[0].filters?.providerId).toBeUndefined();
  });

  it('Given partial tag input, When typing and committing, Then separators survive and tags parse once', async () => {
    const user = userEvent.setup();
    const onViewStateChange = vi.fn<(next: SearchViewState) => void>();

    render(
      <SearchPage
        data={makeData('berserk')}
        isLoading={false}
        isError={false}
        viewState={{ query: 'berserk' }}
        onViewStateChange={onViewStateChange}
        onOpenManga={() => {}}
      />,
    );

    const input = screen.getByLabelText('Included tags');
    await user.type(input, 'action, comedy');

    // The draft keeps the comma and the not-yet-committed tag.
    expect(input).toHaveValue('action, comedy');
    // Typing alone does not churn the query.
    expect(onViewStateChange).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');

    expect(onViewStateChange).toHaveBeenCalledTimes(1);
    expect(onViewStateChange.mock.calls[0]?.[0].filters?.includedTags).toEqual([
      'action',
      'comedy',
    ]);
    expect(input).toHaveValue('action, comedy');
  });
});
