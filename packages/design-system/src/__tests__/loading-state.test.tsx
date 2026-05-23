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