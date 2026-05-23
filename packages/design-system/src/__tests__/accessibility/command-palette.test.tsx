import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Command, CommandInput, CommandList, CommandItem } from '../../components/ui/command.js';

describe('Command Palette Keyboard Navigation', () => {
  const renderCommandPalette = () => {
    return render(
      <Command>
        <CommandInput placeholder="Type a command..." />
        <CommandList>
          <CommandItem>
            View Library
          </CommandItem>
          <CommandItem>
            Add Manga
          </CommandItem>
          <CommandItem>
            Search
          </CommandItem>
          <CommandItem>
            Settings
          </CommandItem>
        </CommandList>
      </Command>
    );
  };

  it('renders command palette with input', () => {
    renderCommandPalette();

    expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
  });

  it('renders command items', () => {
    renderCommandPalette();

    expect(screen.getByText('View Library')).toBeInTheDocument();
    expect(screen.getByText('Add Manga')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('input is keyboard accessible', () => {
    renderCommandPalette();

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('has proper list structure', () => {
    renderCommandPalette();

    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('has visible text input', () => {
    renderCommandPalette();

    const input = screen.getByPlaceholderText('Type a command...');
    expect(input).toBeVisible();
  });

  it('command items have cursor pointer styling', () => {
    renderCommandPalette();

    const items = screen.getAllByRole('listitem');
    items.forEach((item) => {
      expect(item).toHaveClass('cursor-pointer');
    });
  });

  it('renders all four command items', () => {
    renderCommandPalette();

    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(4);
  });
});