// File-level because react-doctor's own `react-doctor-disable-next-line` for the same kept
// decision needs the line directly above `role="dialog"` (ruling mvd4xjfd): <dialog> moves this
// overlay into the top layer and adds its own open state plus UA max-width/centering, so it is
// not equivalent to this hand-rolled palette; role + aria-modal is the accessible equivalent.
// oxlint-disable jsx-a11y/prefer-tag-over-role
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useGSAP } from '@gsap/react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@app/design-system';
import { commandPaletteEnter, commandPaletteExit, useReducedMotion } from '@app/motion';
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import {
  commandMatchesQuery,
  groupCommandsBySection,
  registry,
  type Command as PaletteCommand,
} from './CommandRegistry';
import { useTheme } from '@/providers/theme-provider.js';
import { usePlatform } from '@/providers/platform-provider.js';
import { useLocalCommands } from './useLocalCommands.js';

function useBuiltInCommands() {
  const navigate = useNavigate();
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const { theme, setTheme } = useTheme();

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-module-registry: `registry` is a module-level mutable registry; registering on mount and unregistering on unmount is subscription bookkeeping. The handlers close over navigate/theme, which have no module-scope home.
  useEffect(() => {
    const commands: PaletteCommand[] = [
      {
        id: 'nav-discover',
        label: 'Go to Discover',
        section: 'Navigation',
        keywords: ['discover', 'browse', 'catalog', 'home'],
        handler: () => navigate({ to: '/discover' } as const),
      },
      {
        id: 'nav-library',
        label: 'Go to Library',
        section: 'Navigation',
        keywords: ['library', 'saved'],
        handler: () => navigate({ to: '/library' } as const),
      },
      {
        id: 'nav-search',
        label: 'Go to Search',
        section: 'Navigation',
        keywords: ['search', 'find'],
        handler: () => navigate({ to: '/search' } as const),
      },
      {
        id: 'nav-settings',
        label: 'Settings',
        section: 'Settings',
        keywords: ['settings', 'preferences', 'all'],
        handler: () => navigate({ to: '/settings' } as const),
      },
      {
        id: 'settings-app',
        label: 'App settings',
        section: 'Settings',
        keywords: ['settings', 'preferences', 'general', 'content', 'performance'],
        handler: () => navigate({ to: '/settings/app' } as const),
      },
      {
        id: 'settings-reader',
        label: 'Reader settings',
        section: 'Settings',
        keywords: ['settings', 'reader', 'reading', 'layout', 'gestures'],
        handler: () => navigate({ to: '/settings/reader' } as const),
      },
      {
        id: 'settings-themes',
        label: 'Themes',
        section: 'Settings',
        keywords: ['themes', 'theme', 'appearance', 'colors', 'dark', 'light'],
        handler: () => navigate({ to: '/theme' } as const),
      },
      {
        id: 'settings-storage',
        label: 'Storage',
        section: 'Settings',
        keywords: ['storage', 'cache', 'disk', 'space', 'usage'],
        handler: () => navigate({ to: '/storage' } as const),
      },
      {
        id: 'settings-backup',
        label: 'Backup',
        section: 'Settings',
        keywords: ['backup', 'restore', 'export', 'import'],
        handler: () => navigate({ to: '/backup' } as const),
      },
      {
        id: 'nav-advanced',
        label: 'Advanced',
        section: 'Advanced',
        keywords: ['advanced', 'tools'],
        handler: () => navigate({ to: '/advanced' } as const),
      },
      {
        id: 'advanced-theme-editor',
        label: 'Theme editor',
        section: 'Advanced',
        keywords: ['theme', 'editor', 'custom', 'colors'],
        handler: () => navigate({ to: '/advanced/theme' } as const),
      },
      {
        id: 'advanced-diagnostics',
        label: 'Diagnostics',
        section: 'Advanced',
        keywords: ['diagnostics', 'debug', 'info', 'logs'],
        handler: () => navigate({ to: '/advanced/diagnostics' } as const),
      },
      {
        id: 'advanced-migration',
        label: 'Migration',
        section: 'Advanced',
        keywords: ['migration', 'migrate', 'provider', 'move'],
        handler: () => navigate({ to: '/advanced/migration', search: {} } as const),
      },
      {
        id: 'nav-extensions',
        label: 'Extensions',
        section: 'Extensions',
        keywords: ['extensions', 'plugins', 'providers', 'open'],
        handler: () => navigate({ to: '/extensions' } as const),
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        section: 'App',
        keywords: ['sidebar', 'toggle', 'show', 'hide'],
        handler: () => toggleSidebar(),
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Theme',
        section: 'App',
        keywords: ['theme', 'dark', 'light', 'mode'],
        handler: () => setTheme(theme === 'light' ? 'dark' : 'light'),
      },
    ];

    for (const command of commands) registry.register(command);
    return () => {
      for (const command of commands) registry.unregister(command.id);
    };
  }, [navigate, toggleSidebar, theme, setTheme]);
}

export function CommandPalette() {
  const deviceLayout = useLayoutStore((s) => s.deviceLayout);
  const { runtime } = usePlatform();
  const { isOpen, query, selectedIndex, close, setQuery, moveSelection, setSelectedIndex } =
    useCommandPaletteStore();
  const reducedMotion = useReducedMotion();
  const [rendered, setRendered] = useState(isOpen);
  const scopeRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useBuiltInCommands();
  const isDesktop = deviceLayout === 'desktop' || runtime === 'electron';
  const localCommands = useLocalCommands(isDesktop && isOpen);

  // Opening must paint the panel in the same commit as `isOpen` flips true; an
  // effect would paint one frame without it (and would cascade a render).
  if (isOpen && !rendered) {
    setRendered(true);
  }

  // Escape must close the palette from anywhere: the input's own handler only
  // fires once it holds focus, and focus lands a frame after the palette opens.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-window-keydown: a window-level keydown subscription is a true external-system boundary; it must exist for the whole open window, not for the life of the focused input.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, close]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-focus-after-open: focusing the input needs the panel committed and the GSAP enter started; autoFocus would fight the enter animation's transform and scroll the panel.
  useEffect(() => {
    if (!isOpen || !rendered) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, rendered]);

  useGSAP(
    () => {
      if (!rendered || !backdropRef.current || !panelRef.current) return;

      if (isOpen) {
        commandPaletteEnter(backdropRef.current, panelRef.current, { reducedMotion });
        return;
      }

      commandPaletteExit(backdropRef.current, panelRef.current, {
        reducedMotion,
        onComplete: () => setRendered(false),
      });
    },
    { scope: scopeRef, dependencies: [isOpen, rendered, reducedMotion] },
  );

  const results = [
    ...registry.search(query),
    ...localCommands.filter((command) => commandMatchesQuery(command, query)),
  ];
  const grouped = groupCommandsBySection(results);
  // Selection follows the rendered order, not registry order: grouping moves
  // local-data sections (Recent) ahead of the settings they were registered after.
  const renderedCommands = grouped.flatMap(([, commands]) => commands);

  // Not memoized on purpose: `results` is rebuilt every render, so a manual
  // dependency list cannot be preserved (react/preserve-manual-memoization),
  // and nothing memoized consumes this handler.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    const maxIndex = Math.max(0, renderedCommands.length - 1);
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
      const cmd = renderedCommands[selectedIndex];
      if (cmd) {
        cmd.handler();
        close();
      }
    }
  };

  if (!isDesktop) return null;

  return (
    <div ref={scopeRef}>
      {rendered ? (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the overlay is the palette's single keyboard scope: Arrow/Enter/Escape must work from anywhere inside it (input, items, backdrop). The input must not bind the handler again -- its keydown already bubbles here, and binding both fired every moveSelection twice
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 palette-top"
          // react-doctor-disable-next-line react-doctor/prefer-html-dialog -- ruling mvd4xjfd (same keep as the file-level jsx-a11y/prefer-tag-over-role disable above): <dialog> would move this overlay into the top layer and bring its own open state, Escape handling and UA max-width/centering, duplicating the palette's GSAP enter/exit; role + aria-modal is the accessible equivalent.
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onKeyDown={handleKeyDown}
        >
          <div
            ref={backdropRef}
            className="fixed inset-0 glass-scrim"
            onClick={close}
            aria-hidden="true"
          />
          <Command ref={panelRef} className="relative z-10 w-full max-w-xl">
            <div className="flex items-center border-b border-border px-3">
              <CommandInput
                ref={inputRef}
                placeholder="Search commands…"
                aria-label="Search commands"
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
                grouped.map(([section, cmds]) => (
                  <CommandGroup key={section}>
                    <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section}
                    </div>
                    {cmds.map((cmd) => {
                      const globalIndex = renderedCommands.indexOf(cmd);
                      const selected = globalIndex === selectedIndex;
                      return (
                        <CommandItem
                          key={cmd.id}
                          data-selected={selected}
                          aria-selected={selected}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          onClick={() => {
                            cmd.handler();
                            close();
                          }}
                          onSelect={() => {
                            cmd.handler();
                            close();
                          }}
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
      ) : null}
    </div>
  );
}
