import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from '../components/segmented-control.js';

const options = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
  { value: 'compact', label: 'Compact' },
] as const;

describe('SegmentedControl', () => {
  afterEach(() => {
    cleanup();
  });

  it('marks the active option pressed inside a labelled group', () => {
    render(
      <SegmentedControl
        label="Library layout"
        value="list"
        options={options}
        onChange={vi.fn<(value: string) => void>()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Library layout' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects an option through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string) => void>();
    render(
      <SegmentedControl
        label="Library layout"
        value="list"
        options={options}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(onChange).toHaveBeenCalledWith('compact');
  });

  it('disables every option together', () => {
    render(
      <SegmentedControl
        label="Library layout"
        value="grid"
        options={options}
        onChange={vi.fn<(value: string) => void>()}
        disabled
      />,
    );

    for (const option of options) {
      expect(screen.getByRole('button', { name: option.label })).toBeDisabled();
    }
  });
});
