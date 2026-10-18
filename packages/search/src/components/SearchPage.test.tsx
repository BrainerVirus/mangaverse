/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchPage } from './SearchPage.js';

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
});
