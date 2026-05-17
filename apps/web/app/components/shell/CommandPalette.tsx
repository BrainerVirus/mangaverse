import { useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@app/design-system';
import { useCommandPaletteStore } from '../../stores/useCommandPaletteStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { registry } from './CommandRegistry';
import { useTheme } from '../../providers/theme-provider.js';

function useBuiltInCommands() {
  const navigate = useNavigate();
  const { toggleSidebar } = useLayoutStore();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    registry.register({
      id: 'nav-library',
      label: 'Go to Library',
      section: 'Navigation',
      keywords: ['library', 'home'],
      handler: () => navigate({ to: '/library' } as const),
    });

    registry.register({
      id: 'nav-search',
      label: 'Go to Search',
      section: 'Navigation',
      keywords: ['search', 'find'],
      handler: () => navigate({ to: '/search' } as const),
    });

    registry.register({
      id: 'nav-settings',
      label: 'Settings',
      section: 'Navigation',
      keywords: ['settings', 'preferences'],
      handler: () => navigate({ to: '/settings' } as const),
    });

    registry.register({
      id: 'nav-extensions',
      label: 'Extensions',
      section: 'Navigation',
      keywords: ['extensions', 'plugins', 'providers'],
      handler: () => navigate({ to: '/extensions' } as const),
    });

    registry.register({
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      section: 'App',
      keywords: ['sidebar', 'toggle', 'show', 'hide'],
      handler: () => toggleSidebar(),
    });

    registry.register({
      id: 'toggle-theme',
      label: 'Toggle Theme',
      section: 'App',
      keywords: ['theme', 'dark', 'light', 'mode'],
      handler: () => setTheme(theme === 'light' ? 'dark' : 'light'),
    });

    registry.register({
      id: 'nav-diagnostics',
      label: 'Diagnostics',
      section: 'Navigation',
      keywords: ['diagnostics', 'debug', 'info'],
      handler: () => navigate({ to: '/diagnostics' } as const),
    });

    return () => {
      registry.unregister('nav-library');
      registry.unregister('nav-search');
      registry.unregister('nav-settings');
      registry.unregister('nav-extensions');
      registry.unregister('toggle-sidebar');
      registry.unregister('toggle-theme');
      registry.unregister('nav-diagnostics');
    };
  }, [navigate, toggleSidebar, theme, setTheme]);
}

function groupBySection(commands: ReturnType<typeof registry.search>) {
  const groups: Record<string, typeof commands> = {};
  for (const cmd of commands) {
    const section = cmd.section;
    if (!groups[section]) groups[section] = [];
    groups[section]!.push(cmd);
  }
  return groups;
}

export function CommandPalette() {
  const { deviceLayout } = useLayoutStore();
  const { isOpen, query, selectedIndex, close, setQuery, moveSelection, setSelectedIndex } = useCommandPaletteStore();

  useBuiltInCommands();

  const results = registry.search(query);
  const grouped = groupBySection(results);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      const maxIndex = Math.max(0, results.length - 1);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1, maxIndex);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1, maxIndex);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = results[selectedIndex];
        if (cmd) {
          cmd.handler();
          close();
        }
      }
    },
    [close, moveSelection, results, selectedIndex]
  );

  if (deviceLayout !== 'desktop') return null;
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onKeyDown={handleKeyDown}
    >
      <div className="fixed inset-0 bg-black/50" onClick={close} onKeyDown={(e) => e.key === 'Escape' && close()} />
      <Command className="w-full max-w-lg">
        <div className="flex items-center border-b border-border px-3">
          <CommandInput
            placeholder="Type a command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>
        <CommandList>
          {results.length === 0 ? (
            <CommandEmpty>No commands found.</CommandEmpty>
          ) : (
            Object.entries(grouped).map(([section, cmds]) => (
              <CommandGroup key={section}>
                <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">{section}</div>
                {cmds.map((cmd) => {
                  const globalIndex = results.indexOf(cmd);
                  return (
                    <CommandItem
                      key={cmd.id}
                      onSelect={() => {
                        cmd.handler();
                        close();
                      }}
                      className={globalIndex === selectedIndex ? 'bg-accent text-accent-foreground' : ''}
                    >
                      {cmd.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))
          )}
        </CommandList>
      </Command>
    </div>
  );
}