/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { toMangaId, toProviderMappingId, type MangaIdentity } from '@app/shared';
import { DiscoverPage } from './DiscoverPage.js';

describe('DiscoverPage', () => {
  it('fills the shell main instead of rendering a second main landmark', () => {
    const { container } = render(
      <DiscoverPage
        data={{ providers: [] }}
        selectedProviderId={null}
        expandedSection={null}
        isLoading={false}
        onSelectProvider={() => {}}
        onOpenManga={() => {}}
        onSeeAllSection={() => {}}
        onBackFromSection={() => {}}
      />,
    );

    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Discover' })).toBeInTheDocument();
  });
});

const MANGA: MangaIdentity = {
  id: toMangaId('m1'),
  canonicalTitle: 'One',
  alternativeTitles: [],
  authors: [],
  artists: [],
  tags: [],
  status: 'ongoing',
  contentRating: 'safe',
  providerMappings: [],
  defaultProviderMappingId: toProviderMappingId('map-1'),
  merged: false,
};

function pageData(
  sections: readonly {
    readonly id: string;
    readonly title: string;
    readonly status?: 'ok' | 'empty' | 'error' | 'loading';
    readonly error?: { readonly kind: string; readonly message: string };
    readonly results?: readonly MangaIdentity[];
  }[],
) {
  return {
    providers: [
      {
        providerId: 'p',
        providerName: 'Provider',
        sections: sections.map((section) => ({
          capability: `discovery.${section.id}`,
          results: section.results ?? [],
          ...section,
        })),
      },
    ],
  };
}

function renderPage(props: Partial<Parameters<typeof DiscoverPage>[0]> = {}) {
  return render(
    <DiscoverPage
      data={pageData([{ id: 'latest', title: 'Latest', status: 'ok', results: [MANGA] }])}
      selectedProviderId="p"
      expandedSection={null}
      isLoading={false}
      onSelectProvider={() => {}}
      onOpenManga={() => {}}
      onSeeAllSection={() => {}}
      onBackFromSection={() => {}}
      {...props}
    />,
  );
}

describe('DiscoverPage failure surfaces', () => {
  it('Given one section fails, Then its row keeps a Retry while the healthy section still renders', () => {
    const onRetrySection = vi.fn<(sectionId: string) => void>();
    renderPage({
      data: pageData([
        { id: 'latest', title: 'Latest', status: 'ok', results: [MANGA] },
        {
          id: 'popular',
          title: 'Popular',
          status: 'error',
          error: { kind: 'provider-unavailable', message: 'Popular is unavailable.' },
        },
      ]),
      onRetrySection,
    });

    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByTestId('discover-section-popular-error')).toHaveTextContent(
      'Popular couldn’t load',
    );
    fireEvent.click(
      within(screen.getByTestId('discover-section-popular-error')).getByRole('button', {
        name: 'Retry',
      }),
    );
    expect(onRetrySection).toHaveBeenCalledWith('popular');
  });

  it('Given a section is empty, Then it says so instead of disappearing', () => {
    renderPage({
      data: pageData([{ id: 'latest', title: 'Latest', status: 'empty' }]),
    });

    expect(screen.getByTestId('discover-section-latest-empty')).toHaveTextContent(
      'Nothing here yet.',
    );
  });

  it('Given settings fail, Then content still renders with a settings Retry', () => {
    const onRetrySettings = vi.fn<() => void>();
    renderPage({
      settingsFailure: {
        kind: 'settings',
        title: 'Settings could not be read',
        message: 'Discover is showing safe content only.',
      },
      onRetrySettings,
    });

    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByTestId('discover-settings-error')).toHaveTextContent(
      'Settings could not be read',
    );
    fireEvent.click(
      within(screen.getByTestId('discover-settings-error')).getByRole('button', { name: 'Retry' }),
    );
    expect(onRetrySettings).toHaveBeenCalledTimes(1);
  });

  it('Given the library fails inside a section, Then the copy names the library and offers Back', () => {
    renderPage({
      expandedSection: { providerId: 'p', sectionId: 'latest' },
      failure: {
        kind: 'database',
        title: 'Could not open your library',
        message: 'The local library could not be opened.',
      },
      onRetry: () => {},
    });

    expect(screen.getByText('Could not open your library')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
  });

  it('Given no providers and no failure, Then the provider hint renders', () => {
    renderPage({
      data: { providers: [] },
      selectedProviderId: null,
      showProviderHint: true,
      onBrowseProviders: vi.fn<() => void>(),
    });

    // EmptyState fades in with GSAP; jsdom keeps it invisible until the animation runs.
    expect(screen.getByText('Browse providers').closest('button')).not.toBeNull();
  });

  it('Given a failed first expanded page, Then Back and Retry stay visible', () => {
    const onRetry = vi.fn<() => void>();
    renderPage({
      expandedSection: { providerId: 'p', sectionId: 'latest' },
      expandedSectionState: {
        title: 'Latest',
        results: [],
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        error: { kind: 'provider-unavailable', message: 'Latest is unavailable.' },
      },
      onRetryExpandedSection: onRetry,
    });

    expect(screen.getByRole('button', { name: 'Back to discover' })).toBeInTheDocument();
    expect(screen.getByText('Latest couldn’t load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('Given a failed next page, Then loaded results stay and load-more Retry is offered', () => {
    const onRetry = vi.fn<() => void>();
    renderPage({
      expandedSection: { providerId: 'p', sectionId: 'latest' },
      expandedSectionState: {
        title: 'Latest',
        results: [MANGA],
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: true,
        nextPageError: { kind: 'provider-unavailable', message: 'The next page did not load.' },
      },
      onRetryExpandedSection: onRetry,
    });

    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByTestId('discover-section-load-more-error')).toHaveTextContent(
      'Couldn’t load more',
    );
    fireEvent.click(
      within(screen.getByTestId('discover-section-load-more-error')).getByRole('button', {
        name: 'Retry',
      }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
