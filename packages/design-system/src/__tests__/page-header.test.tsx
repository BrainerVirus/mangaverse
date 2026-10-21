import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../components/page-header.js';

describe('PageHeader', () => {
  it('lets the title and actions wrap when the content column is narrow', () => {
    // Regression: at 844×390 with 44 px side insets and the rail expanded the library
    // column is 472 px, while title + search + layout toggle need ~531 px. Without wrap
    // the actions overflow the main box and the last layout button is clipped.
    render(
      <PageHeader
        title="Library"
        description="Your saved manga, comics, and webtoons"
        actions={<button type="button">Compact</button>}
      />,
    );

    const actions = screen.getByRole('button', { name: 'Compact' }).parentElement;
    expect(actions).toHaveClass('sm:flex-wrap');
    expect(actions?.parentElement).toHaveClass('sm:flex-wrap');
  });
});
