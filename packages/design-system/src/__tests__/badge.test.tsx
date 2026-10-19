import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../components/ui/badge.js';

describe('Badge', () => {
  it('uses the metadata role without the default badge type styles', () => {
    render(
      <Badge size="meta" variant="secondary">
        3 items
      </Badge>,
    );

    const badge = screen.getByText('3 items');
    expect(badge).toHaveClass('type-meta');
    expect(badge).not.toHaveClass('text-xs');
    expect(badge).not.toHaveClass('font-semibold');
  });
});
