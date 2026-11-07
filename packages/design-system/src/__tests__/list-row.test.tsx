import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ListRow } from '../components/list-row.js';

describe('ListRow', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the shared matte row', () => {
    render(<ListRow data-testid="row">One</ListRow>);

    const row = screen.getByTestId('row');
    expect(row.tagName).toBe('DIV');
    expect(row).toHaveClass('rounded-control', 'bg-muted', 'p-3');
  });

  it('renders an li with the outline tone and row padding', () => {
    render(
      <ListRow as="li" data-testid="row" tone="outline" padding="row">
        One
      </ListRow>,
    );

    const row = screen.getByTestId('row');
    expect(row.tagName).toBe('LI');
    expect(row).toHaveClass('rounded-control', 'border', 'border-border', 'px-3', 'py-2');
    expect(row).not.toHaveClass('bg-muted');
  });

  it('keeps the caller classes after the shared ones', () => {
    render(
      <ListRow data-testid="row" className="text-sm">
        One
      </ListRow>,
    );

    expect(screen.getByTestId('row')).toHaveClass('text-sm');
  });
});
