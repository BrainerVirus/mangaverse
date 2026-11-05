import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PageContainer } from '../components/page-container.js';

describe('PageContainer', () => {
  it('frames wide pages at 1600px with the shared padding', () => {
    const { container } = render(<PageContainer>content</PageContainer>);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame).toHaveAttribute('data-page-container', 'wide');
    expect(frame).toHaveClass('max-w-400', 'px-6', 'py-6', 'lg:px-8', 'lg:py-8');
  });

  it('narrows the read variant without centring it, so titles share one left edge', () => {
    const { container } = render(<PageContainer variant="read">content</PageContainer>);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame).toHaveClass('max-w-3xl', 'px-6', 'lg:px-8');
    expect(frame).not.toHaveClass('mx-auto');
  });

  it('lets a caller narrow the column further', () => {
    const { container } = render(
      <PageContainer variant="read" className="max-w-5xl">
        content
      </PageContainer>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame).toHaveClass('max-w-5xl');
    expect(frame).not.toHaveClass('max-w-3xl');
  });
});
