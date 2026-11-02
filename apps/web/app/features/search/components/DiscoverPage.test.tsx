/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoverPage } from './DiscoverPage.js';

describe('DiscoverPage', () => {
  it('fills the shell main instead of rendering a second main landmark', () => {
    const { container } = render(
      <DiscoverPage
        data={{ providers: [] }}
        selectedProviderId={null}
        expandedSection={null}
        isLoading={false}
        isError={false}
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
