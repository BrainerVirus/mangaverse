import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
});
