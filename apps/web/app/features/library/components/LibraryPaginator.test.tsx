/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LibraryPaginator } from './LibraryPaginator.js';

describe('LibraryPaginator', () => {
  it('shows the loaded and matching counts and asks for the next page', () => {
    render(<LibraryPaginator loaded={200} total={1_250} onLoadMore={() => Promise.resolve()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Showing 200 of 1,250 titles');
    expect(screen.getByRole('button', { name: 'Load more titles' })).toBeEnabled();
  });

  it('Given the cap is reached, Then it says how many of the matches are shown and offers no button', () => {
    const onLoadMore = vi.fn<() => Promise<void>>(() => Promise.resolve());
    render(<LibraryPaginator loaded={5_000} total={8_000} onLoadMore={onLoadMore} />);

    expect(screen.getByRole('status')).toHaveTextContent('Showing 5,000 of 8,000 titles');
    expect(screen.getByText('This view is limited to the first 5,000 titles.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more titles' })).toBeNull();
  });
});
