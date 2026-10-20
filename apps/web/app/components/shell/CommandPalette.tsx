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
import { registry } from './CommandRegistry';
import { useTheme } from '@/providers/theme-provider.js';
import { usePlatform } from '@/providers/platform-provider.js';

function useBuiltInCommands() {
  const navigate = useNavigate();
  const { toggleSidebar } = useLayoutStore();
  const { theme, setTheme } = useTheme();

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-module-registry: `registry` is a module-level mutable registry; registering on mount and unregistering on unmount is subscription bookkeeping. The handlers close over navigate/theme, which have no module-scope home.
  useEffect(() => {
    registry.register({
      id: 'nav-discover',
      label: 'Go to Discover',
      section: 'Navigation',
      keywords: ['discover', 'browse', 'catalog', 'home'],
      handler: () => navigate({ to: '/discover' } as const),
    });

    registry.register({
      id: 'nav-library',
      label: 'Go to Library',
      section: 'Navigation',
      keywords: ['library', 'saved'],
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
      registry.unregister('nav-discover');
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

  const results = registry.search(query);
  const grouped = groupBySection(results);

  // Not memoized on purpose: `results` is rebuilt every render, so a manual
  // dependency list cannot be preserved (react/preserve-manual-memoization),
  // and nothing memoized consumes this handler.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
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
  };

  if (deviceLayout !== 'desktop' && runtime !== 'electron') return null;

  return (
    <div ref={scopeRef}>
      {rendered ? (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the overlay is the palette's single keyboard scope: Arrow/Enter/Escape must work from anywhere inside it (input, items, backdrop). The input must not bind the handler again -- its keydown already bubbles here, and binding both fired every moveSelection twice
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          // react-doctor-disable-next-line react-doctor/prefer-html-dialog -- ruling mvd4xjfd (same keep as the file-level jsx-a11y/prefer-tag-over-role disable above): <dialog> would move this overlay into the top layer and bring its own open state, Escape handling and UA max-width/centering, duplicating the palette's GSAP enter/exit; role + aria-modal is the accessible equivalent.
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onKeyDown={handleKeyDown}
        >
          <div
            ref={backdropRef}
            // oxlint-disable-next-line shadcn/no-unknown-classes -- app lint cannot resolve @utility classes from @app/design-system's stylesheet.
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
                Object.entries(grouped).map(([section, cmds]) => (
                  <CommandGroup key={section}>
                    <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section}
                    </div>
                    {cmds.map((cmd) => {
                      const globalIndex = results.indexOf(cmd);
                      const selected = globalIndex === selectedIndex;
                      return (
                        <CommandItem
                          key={cmd.id}
                          data-selected={selected}
                          aria-selected={selected}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
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
