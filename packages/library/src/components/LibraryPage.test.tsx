/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LibraryPage } from './LibraryPage.js';
import { DEFAULT_LIBRARY_VIEW_STATE } from '../view-state.js';

describe('LibraryPage', () => {
  it('fills the shell main instead of rendering a second main landmark', () => {
    const { container } = render(
      <LibraryPage
        data={{ items: [], categories: [], viewState: DEFAULT_LIBRARY_VIEW_STATE }}
        isLoading={false}
        isError={false}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Library' })).toBeInTheDocument();
  });
});
