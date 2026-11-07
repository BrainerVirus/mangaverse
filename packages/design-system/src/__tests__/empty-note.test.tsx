import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyNote } from '../components/empty-note.js';

describe('EmptyNote', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the inline empty frame', () => {
    render(<EmptyNote>No provider source is attached.</EmptyNote>);

    const note = screen.getByText('No provider source is attached.');
    expect(note.tagName).toBe('P');
    expect(note).toHaveClass('rounded-box', 'border', 'border-border', 'px-4', 'py-6');
  });
});
