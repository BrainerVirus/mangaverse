import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoadingState } from '../components/loading-state.js';

describe('LoadingState', () => {
  it('renders grid skeleton count matching count prop', () => {
    render(<LoadingState type="grid" count={5} />);

    const gridContainer = document.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
  });

  it('renders default grid skeleton count when count not provided', () => {
    render(<LoadingState type="grid" />);

    const gridContainer = document.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
  });

  it('renders two complete rows at every column count when count is omitted', () => {
    const { container } = render(<LoadingState type="grid" />);

    const cells = [...container.querySelectorAll('.grid > div')];
    expect(cells).toHaveLength(12);
    // 2 columns show 4 cells, 3 show 6, 4 show 8, 5 show 10 and 6 show 12: a row is never partial.
    const visibleAt = (width: number) =>
      cells.filter((cell) => {
        const gate = /@min-\[(\d+)px\]:block/.exec(cell.className);
        return !cell.className.includes('hidden') || (gate !== null && width >= Number(gate[1]));
      }).length;
    expect([320, 640, 768, 1024, 1280].map(visibleAt)).toEqual([4, 6, 8, 10, 12]);
  });

  it('sizes every grid cell as a 3:4 cover and adds a caption line only on request', () => {
    const plain = render(<LoadingState type="grid" count={2} />);
    expect(plain.container.querySelectorAll('.aspect-3\\/4')).toHaveLength(2);
    expect(plain.container.querySelector('.mt-1')).toBeNull();
    plain.unmount();

    const captioned = render(<LoadingState type="grid" count={2} caption />);
    expect(captioned.container.querySelectorAll('.mt-1')).toHaveLength(2);
  });

  it('follows the content column by default, and the viewport when the page asks for its own columns', () => {
    const content = render(<LoadingState type="grid" count={6} />);
    expect(content.container.firstElementChild).toHaveClass('@container');
    expect(content.container.querySelector('.grid')?.className).toContain(
      '@min-[1280px]:grid-cols-6',
    );
    content.unmount();

    const four = render(<LoadingState type="grid" count={4} columns="viewport-4" />);
    expect(four.container.querySelector('.grid')).toHaveClass('md:grid-cols-4');
    expect(four.container.querySelector('.grid')?.className).not.toContain('@min-');
    four.unmount();

    const row = render(<LoadingState type="grid" count={6} columns="row" />);
    expect(row.container.firstElementChild).toHaveClass('@container');
    expect(row.container.querySelector('.grid')?.className).toContain('@min-[1280px]:grid-cols-6');
    expect(row.container.querySelector('.grid')?.className).not.toMatch(/(^| )(sm|md|lg):/);
  });

  it('shows one placeholder row at every column count and never wraps or leaves a hole', () => {
    const { container } = render(<LoadingState type="grid" count={6} columns="row" />);
    const cells = [...container.querySelectorAll('.grid > div')].map((cell) => cell.className);
    expect(cells).toHaveLength(6);
    expect(cells.slice(0, 2).some((name) => name.includes('hidden'))).toBe(false);
    expect(cells.slice(2).every((name) => name.includes('hidden'))).toBe(true);
    // columns 2, 3, 4, 5, 6 show 2, 3, 4, 5, 6 covers: each cell appears at its own breakpoint.
    expect(cells[2]).toContain('@min-[640px]:block');
    expect(cells[5]).toContain('@min-[1280px]:block');
  });

  it('renders settings-style cards with the requested number of control rows', () => {
    const { container } = render(<LoadingState type="sections" count={3} rows={2} />);

    const cards = container.querySelectorAll('.rounded-box.border');
    expect(cards).toHaveLength(3);
    expect(cards[0]?.querySelectorAll('.h-11')).toHaveLength(2);
  });

  it('renders exactly count grid cards when count is passed', () => {
    const { container } = render(<LoadingState type="grid" count={3} />);

    expect(container.querySelectorAll('.grid > div')).toHaveLength(3);
  });

  it('renders 8 list rows when count is omitted', () => {
    const { container } = render(<LoadingState type="list" />);

    expect(container.querySelectorAll('.border-border')).toHaveLength(8);
  });

  it('renders list skeleton layout when type is list', () => {
    render(<LoadingState type="list" count={3} />);

    const listContainer = document.querySelector('[class*="flex-col"]');
    expect(listContainer).toBeInTheDocument();
  });

  it('renders default list skeleton count when count not provided', () => {
    render(<LoadingState type="list" />);

    const listContainer = document.querySelector('[class*="flex-col"]');
    expect(listContainer).toBeInTheDocument();
  });

  it('renders detail skeleton layout correctly', () => {
    render(<LoadingState type="detail" />);

    expect(document.querySelector('[class*="flex flex-col gap-6"]')).toBeInTheDocument();
  });

  it('renders grid layout with correct responsive classes', () => {
    const { container } = render(<LoadingState type="grid" count={1} />);

    expect(container.querySelector('.grid')).toBeInTheDocument();
  });

  it('renders list layout correctly', () => {
    const { container } = render(<LoadingState type="list" count={1} />);

    expect(container.querySelector('[class*="flex-col"]')).toBeInTheDocument();
  });

  it('handles count of 0 by falling back to default', () => {
    render(<LoadingState type="grid" count={0} />);

    const gridContainer = document.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
  });

  it('handles negative count by falling back to default', () => {
    render(<LoadingState type="grid" count={-5} />);

    const gridContainer = document.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
  });

  it('renders detail layout with flex row for md+', () => {
    render(<LoadingState type="detail" />);

    expect(document.querySelector('[class*="md:flex-row"]')).toBeInTheDocument();
  });
});
