import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';

const PROVIDERS = [
  { id: 'mangadex', name: 'MangaDex' },
  { id: 'comick', name: 'ComicK' },
];

const LONG_OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
  { value: 'd', label: 'Delta' },
  { value: 'e', label: 'Echo' },
  { value: 'f', label: 'Foxtrot' },
  { value: 'g', label: 'Golf' },
  { value: 'h', label: 'Hotel' },
] as const;

function Harness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState('mangadex');
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    >
      <SelectTrigger aria-label="Source provider">
        <SelectValue placeholder="Select source provider" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {PROVIDERS.map((provider) => (
            <SelectItem key={provider.id} value={provider.id}>
              {provider.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function LongHarness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState('a');
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    >
      <SelectTrigger aria-label="Long list">
        <SelectValue placeholder="Pick a letter" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {LONG_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows the selected item text, not the raw value', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Source provider')).toHaveTextContent('MangaDex');
    expect(screen.getByLabelText('Source provider')).not.toHaveTextContent('mangadex');
  });

  it('shows the placeholder while no value is selected', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Target provider">
          <SelectValue placeholder="Select target provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="comick">ComicK</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByLabelText('Target provider')).toHaveTextContent('Select target provider');
  });

  it('opens with the keyboard and selects the highlighted item', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: string) => void>();
    render(<Harness onValueChange={onValueChange} />);

    const trigger = screen.getByLabelText('Source provider');
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('comick');
    expect(screen.getByLabelText('Source provider')).toHaveTextContent('ComicK');
  });

  it('closes on Escape and keeps the focus on the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByLabelText('Source provider');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('bounds the popper popup to the viewport and lets the list scroll', async () => {
    const user = userEvent.setup();
    render(<LongHarness />);

    const trigger = screen.getByLabelText('Long list');
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    const list = screen.getByRole('listbox');
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('min-h-0');
    expect(list.className).toContain('select-list-min');

    const popup = list.parentElement;
    expect(popup).not.toBeNull();
    expect(popup!.className).toContain('flex');
    expect(popup!.className).toContain('select-popup-max');
  });

  it('reaches and selects the last item of a long list with the keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: string) => void>();
    render(<LongHarness onValueChange={onValueChange} />);

    const trigger = screen.getByLabelText('Long list');
    trigger.focus();
    // Opening leaves the selection on the first item; one key press per move lets
    // the list re-render, so the walk reaches the last item even when the list
    // scrolls inside the bounded popup.
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    for (let move = 0; move < LONG_OPTIONS.length - 1; move += 1) {
      await user.keyboard('{ArrowDown}');
    }
    // The final highlight commits after the key event; wait for it so Enter
    // cannot pick the previous item.
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Hotel' })).toHaveAttribute('data-highlighted');
    });
    await user.keyboard('{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('h');
    expect(screen.getByLabelText('Long list')).toHaveTextContent('Hotel');
  });
});
