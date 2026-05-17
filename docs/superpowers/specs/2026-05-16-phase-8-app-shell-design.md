# Phase 8: App Shell — Design Spec

> **Status:** Approved design, ready for implementation plan.
>
> **Context:** Phases 0-7 are complete. The monorepo has all foundation packages (`@app/shared`, `@app/db`, `@app/platform`, `@app/reader`, `@app/extensions-sdk`, `@app/extensions-core`, `@app/design-system`, `@app/motion`). The web app (`apps/web`) has a minimal TanStack Start setup with a single index route and ThemeProvider. The desktop app (`apps/desktop`) has a complete main process but a stub renderer. Phase 8 builds the navigable app shell around these packages.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Persistent sidebar (desktop) + bottom nav (mobile) | Most desktop manga reader pattern; collapses cleanly for mobile. Reader can hide all chrome. |
| Routes | Layered: core real, rest lazy stubs | Core routes get full shell pages now. Remaining routes declared but lazy-loaded to placeholder stubs for Phase 9 to replace. |
| Zustand stores | Multiple focused stores | `useLayoutStore`, `useCommandPaletteStore`, `useNavigationStore`. Avoids monolithic store sprawl. |
| Command palette | Full with plugin architecture | `CommandRegistry` singleton allows Phase 9 features to register commands on mount via `register()`/`unregister()`. |
| Desktop renderer | Integrated web app | Electron renderer imports the same router + providers. Uses `@app/platform` for capability detection. |

## File Structure

All new files live under `apps/web/app/`. The desktop renderer imports from the web app directly.

```
apps/web/app/
  router.tsx                              # (MODIFY) extend with route transition defaults
  routes/
    __root.tsx                            # (MODIFY) wrap with ShellProviders
    index.tsx                             # (MODIFY) use AppShellLayout
    library.tsx                           # CREATE: library shell page
    search.tsx                            # CREATE: search shell page
    manga.$id.tsx                         # CREATE: manga detail shell
    reader.$chapterId.tsx                 # CREATE: reader route shell
    settings.tsx                          # CREATE: settings index
    settings.app.tsx                      # CREATE: app settings section
    settings.reader.tsx                   # CREATE: reader settings section
    extensions.tsx                        # CREATE: stub (lazy)
    extensions.$providerId.tsx            # CREATE: stub (lazy)
    backup.tsx                            # CREATE: stub (lazy)
    migration.tsx                         # CREATE: stub (lazy)
    theme.tsx                             # CREATE: stub (lazy)
    diagnostics.tsx                       # CREATE: stub (lazy)
    onboarding.tsx                        # CREATE: stub (lazy)
  layouts/
    AppShellLayout.tsx                    # CREATE: sidebar + bottom nav wrapper
    ReaderLayout.tsx                      # CREATE: full-viewport reader wrapper
  stores/
    useLayoutStore.ts                     # CREATE: sidebar, bottom nav, device
    useCommandPaletteStore.ts             # CREATE: palette state
    useNavigationStore.ts                 # CREATE: recent routes, breadcrumbs
  providers/
    theme-provider.tsx                    # (NO CHANGES)
    query-provider.tsx                    # CREATE: TanStack Query client
    platform-provider.tsx                 # CREATE: platform capabilities context
  components/
    shell/
      DesktopSidebar.tsx                  # CREATE: icon rail + expandable panel
      MobileBottomNav.tsx                 # CREATE: bottom tab bar
      CommandPalette.tsx                  # CREATE: searchable command overlay
      CommandRegistry.ts                  # CREATE: plugin registration singleton
    ShellProviders.tsx                    # CREATE: composes all providers + layout
```

### Desktop Renderer Changes

```
apps/desktop/src/renderer/src/
  App.tsx                                 # (REPLACE) import web router + providers
  bootstrap.tsx                           # CREATE: platform adapter init
```

## Route Tree Design

TanStack Router file-based routes. All routes use `createFileRoute`.

### Core Routes (real shell pages)

| Route file | Path | Description |
|------------|------|-------------|
| `index.tsx` | `/` | Home/dashboard page |
| `library.tsx` | `/library` | Library grid shell |
| `search.tsx` | `/search` | Search page shell |
| `manga.$id.tsx` | `/manga/$id` | Manga detail shell |
| `reader.$chapterId.tsx` | `/reader/$chapterId` | Reader integration shell |
| `settings.tsx` | `/settings` | Settings index |
| `settings.app.tsx` | `/settings/app` | App settings section |
| `settings.reader.tsx` | `/settings/reader` | Reader settings section |

### Stub Routes (lazy-loaded placeholders)

| Route file | Path | Description |
|------------|------|-------------|
| `extensions.tsx` | `/extensions` | Extension manager stub |
| `extensions.$providerId.tsx` | `/extensions/$providerId` | Provider detail stub |
| `backup.tsx` | `/backup` | Backup/restore stub |
| `migration.tsx` | `/migration` | Migration tool stub |
| `theme.tsx` | `/theme` | Theme customization stub |
| `diagnostics.tsx` | `/diagnostics` | Diagnostics page stub |
| `onboarding.tsx` | `/onboarding` | Onboarding flow stub |

Stub routes render an `EmptyState` with title and description using `@app/design-system`. No business logic. Phase 9 replaces the component.

### Route Configuration

- `defaultPreload: 'intent'` (already set in `router.tsx`)
- `scrollRestoration: true` (already set)
- Stub routes use `lazy` imports: `() => import('./routes/extensions')`
- `defaultPendingComponent`: renders `LoadingState` for async transitions
- `defaultErrorComponent`: uses `ErrorState` (already basic, extend with design-system)
- `defaultNotFoundComponent`: uses `EmptyState` (already basic, extend with design-system)

## Layout System

### AppShellLayout

Wraps all non-reader routes. Detects device breakpoint from window width:

- **Desktop** (`>= 1024px`): Collapsible sidebar on the left. Icons: Library, Search, Settings, Extensions. Optional expanded panel shows labels + secondary items. Content area fills remaining space.
- **Tablet** (`>= 768px and < 1024px`): Same sidebar but starts collapsed. Expands on icon click.
- **Mobile** (`< 768px`): Bottom tab bar with Library, Search, Settings icons. Secondary nav (Extensions, Backup, Diagnostics, etc.) in a hamburger-triggered drawer.

Sidebar toggle is keyboard-accessible (`Cmd+B` / `Ctrl+B`). Bottom nav adapts to safe areas (`env(safe-area-inset-bottom)`).

### ReaderLayout

Wraps the reader route. Full viewport, no app chrome. Provides a `readerChromeVisible` toggle via `useLayoutStore`. Reader chrome (page indicator, chapter nav) is rendered by `@app/design-system`'s `ReaderChrome` component, controlled by the reader's own input state — NOT the layout store.

Keyboard shortcut `Esc` or `F` toggles reader chrome visibility.

### Layout Composition in `__root.tsx`

The root route's `shellComponent` wraps children with `ShellProviders`, which composes:

1. `QueryProvider` (TanStack Query)
2. `ThemeProvider` (existing, unchanged)
3. `PlatformProvider` (capabilities context)
4. `AppShellLayout` or `ReaderLayout` based on active route

Route layouts are selected using TanStack Router's `layout` option or a wrapper component that checks `router.state.matches` for the reader route and renders the appropriate layout.

## Zustand Stores

### useLayoutStore

```ts
interface LayoutState {
  sidebarOpen: boolean;
  sidebarExpanded: boolean;
  deviceLayout: 'desktop' | 'tablet' | 'mobile';
  readerChromeVisible: boolean;
}
```

Actions: `toggleSidebar()`, `toggleSidebarExpand()`, `setDeviceLayout(layout)`, `toggleReaderChrome()`, `setReaderChrome(visible)`.

Device layout detection runs on mount via a resize observer. Stored in Zustand so layouts can read it without prop drilling.

### useCommandPaletteStore

```ts
interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
}
```

Actions: `open()`, `close()`, `toggle()`, `setQuery(q)`, `setSelectedIndex(idx)`, `moveSelection(delta)`.

Keyboard shortcut: `Cmd+K` / `Ctrl+K` opens the palette. `Escape` closes it. `ArrowUp`/`ArrowDown` navigate results. `Enter` executes selected command.

### useNavigationStore

```ts
interface NavigationState {
  recentRoutes: Array<{ path: string; label: string; timestamp: number }>;
  breadcrumbs: Array<{ path: string; label: string }>;
}
```

Actions: `pushRecentRoute(route)`, `setBreadcrumbs(breadcrumbs)`. Populated by `__root.tsx` on route change via `router.subscribe('onResolved', ...)`.

Recent routes cap at 20 entries. Used by the command palette for quick nav.

## Command Palette Plugin Architecture

### CommandRegistry

Singleton class:

```ts
interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string[];
  handler: () => void;
  shortcut?: string;
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  
  register(command: Command): void;
  unregister(id: string): void;
  list(context?: string): Command[];
  search(query: string): Command[];
}
```

The `CommandPalette` component calls `registry.search(query)` to filter results. Results are grouped by `section`.

### Built-in Commands (Phase 8)

| ID | Label | Section | Handler |
|----|-------|---------|---------|
| `nav-library` | Go to Library | Navigation | `router.navigate({ to: '/library' })` |
| `nav-search` | Go to Search | Navigation | `router.navigate({ to: '/search' })` |
| `nav-settings` | Settings | Navigation | `router.navigate({ to: '/settings' })` |
| `nav-extensions` | Extensions | Navigation | `router.navigate({ to: '/extensions' })` |
| `toggle-sidebar` | Toggle Sidebar | App | `layoutStore.toggleSidebar()` |
| `toggle-theme` | Toggle Theme | App | `themeStore.setTheme(theme === 'light' ? 'dark' : 'light')` |
| `nav-diagnostics` | Diagnostics | Navigation | `router.navigate({ to: '/diagnostics' })` |

### Phase 9 Command Registration

Feature pages call `registry.register()` in a `useEffect` on mount and `registry.unregister()` on unmount. Example:

```tsx
// In library.tsx (Phase 9):
useEffect(() => {
  registry.register({
    id: 'library-refresh',
    label: 'Refresh Library',
    section: 'Library',
    handler: () => refreshLibrary(),
  });
  return () => registry.unregister('library-refresh');
}, []);
```

## Root Providers

### QueryProvider

Wraps children with TanStack Query's `QueryClientProvider`. Configures:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,       // 30s default stale time
      gcTime: 5 * 60 * 1000,      // 5min garbage collection
      retry: 1,                    // single retry for provider calls
      refetchOnWindowFocus: false, // local-first doesn't need focus refetch
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});
```

### PlatformProvider

React context that exposes the resolved `PlatformCapabilities` object and a `runtime` string. Initialized once at app boot:

```tsx
const PlatformContext = createContext<{
  capabilities: PlatformCapabilities;
  runtime: PlatformRuntime;
} | null>(null);
```

On web: calls `detectWebCapabilities()` from `@app/platform`.
On desktop: reads from `window.mangaversePlatform.getCapabilities()`.

The `runtime` value drives sidebar vs. bottom nav rendering in `AppShellLayout`.

### ThemeProvider

Existing `ThemeProvider` from `apps/web/app/providers/theme-provider.tsx`. No changes needed. Already handles light/dark via `document.documentElement.classList`.

### ShellProviders Composition

```tsx
export function ShellProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <PlatformProvider>
        <ThemeProvider>
          <AppShellOrReaderLayout>
            {children}
          </AppShellOrReaderLayout>
        </ThemeProvider>
      </PlatformProvider>
    </QueryProvider>
  );
}
```

`AppShellOrReaderLayout` inspects the current route match. If the route is `/reader/$chapterId`, it renders `ReaderLayout`. Otherwise, it renders `AppShellLayout`.

## Desktop Renderer Integration

### apps/desktop/src/renderer/src/App.tsx

Replace the stub with an app that:

1. Imports `ShellProviders` and the web router from `@app/web` (via path alias or relative import)
2. Calls `detectElectronCapabilities()` from `@app/platform` to seed the PlatformProvider
3. Renders `RouterProvider` inside `ShellProviders`

```tsx
import { RouterProvider } from '@tanstack/react-router';
import { ShellProviders } from '@app/web/app/components/ShellProviders';
import { getRouter } from '@app/web/app/router';

export function App() {
  return (
    <ShellProviders>
      <RouterProvider router={getRouter()} />
    </ShellProviders>
  );
}
```

### apps/desktop/src/renderer/src/bootstrap.tsx

Detects Electron runtime via `window.mangaversePlatform` (the preload bridge). Sets `detectElectronCapabilities()` as the platform detection strategy. This value is consumed by the `PlatformProvider` context.

### Desktop-Specific Shell Behavior

- Command palette: always enabled on desktop, shown in sidebar footer with shortcut hint (`Cmd+K`)
- Sidebar: open by default on desktop, icon-rail expands on hover with a short delay
- Fullscreen reader: uses `@app/platform` fullscreen API, not CSS-only fullscreen
- Window controls: menu bar items for Back, Forward, Reload integrated via Electron IPC

## Route Transitions

Use `@app/motion`'s `routeEnter` and `routeExit` helpers. Applied via TanStack Router's `defaultPendingComponent`:

```tsx
// In router.tsx
defaultPendingComponent: ({ routeTransitioning }) => (
  <RouteTransition key={routeTransitioning?.to}>
    <LoadingState />
  </RouteTransition>
),
```

`RouteTransition` is a thin wrapper that calls `routeEnter` on the content element ref on mount. The `routeExit` animation plays on the outgoing page via a cleanup callback or the pending component.

Core routes use `Standard` (220ms) duration. Stub routes skip animation (instant). Reader route uses `Quick` (140ms) to minimize delay.

Respects `prefers-reduced-motion` via `@app/motion`'s `useReducedMotion()` — animations become instant.

## Navigation Preloading

Already configured in `router.tsx` with `defaultPreload: 'intent'`. TanStack Router preloads route chunks and loaders on hover/focus of navigation links.

Route loaders in core routes can prefetch from `@app/db`:

```tsx
export const Route = createFileRoute('/library')({
  loader: async () => {
    const entries = await libraryRepo.getLibraryEntries();
    return { entries };
  },
  component: LibraryPage,
});
```

Phase 8 sets up the loader pattern. Phase 9 fills in real data loading.

## Component Specifications

### DesktopSidebar

- Icon rail (48px wide) on the far left. Expands to 220px on hover/click.
- Icons: Library (`BookOpen`), Search (`Search`), Settings (`Settings`), Extensions (`Puzzle`).
- Active route highlighted with accent background. Uses TanStack Router's `useMatch`.
- Expand panel shows: icon labels, secondary nav items (Backup, Migration, Diagnostics, Theme, Onboarding).
- Collapse button at the bottom.
- Footer: command palette shortcut hint, theme toggle icon.
- Uses `@app/design-system`'s `Tooltip` for collapsed icon labels.

### MobileBottomNav

- 56px tall bar at the viewport bottom. Safe-area aware.
- Tabs: Library, Search, Settings.
- Active tab uses primary color indicator.
- Hamburger icon opens a `Sheet` from `@app/design-system` for secondary navigation.
- Hidden entirely on reader route.

### CommandPalette

- Overlay dialog triggered by `Cmd+K` / `Ctrl+K`.
- Search input at top with `CommandInput` from `@app/design-system`.
- Results grouped by section using `CommandGroup` and `CommandItem`.
- Navigation: Arrow keys move selection, Enter executes.
- Empty state: "No commands found" with suggestion to check spelling.
- Closes on Escape or click outside.
- Renders only on desktop (`runtime === 'electron'` or `deviceLayout === 'desktop'`).

## Dependencies to Add

In `apps/web/package.json`:
- `@tanstack/react-query` (TanStack Query client)
- `zustand` (state management)

In `apps/desktop/package.json`:
- `@tanstack/react-query` (shared query client with web)
- `zustand` (shared stores with web)

## Testing Gates

### Unit Tests

1. **useLayoutStore**: test sidebar toggle, expand, device layout change, reader chrome toggle.
2. **useCommandPaletteStore**: test open/close/toggle, query set, selection navigation.
3. **useNavigationStore**: test push recent route, breadcrumbs set, cap at 20 entries.
4. **CommandRegistry**: test register, unregister, list, search, duplicate ID rejection.
5. **PlatformProvider**: test capabilities context provides correct values for web and electron runtimes.
6. **AppShellLayout**: test renders sidebar on desktop, bottom nav on mobile, hides on reader route.
7. **DesktopSidebar**: test icon rail renders, expand/collapse, active route highlight.
8. **MobileBottomNav**: test tab bar renders, hamburger sheet opens.

### Integration Tests

9. **Router tests**: critical navigation paths resolve correctly. Stub routes lazy-load.
10. **Command palette keyboard tests**: open via shortcut, navigate with arrows, execute with Enter, close with Escape.
11. **Shell accessibility smoke tests**: keyboard navigation works across sidebar, bottom nav, and command palette. Focus rings visible.
12. **Desktop renderer smoke test**: Electron window loads the web app shell correctly.

### No E2E tests required for Phase 8. Those come in Phase 9.

## What Phase 8 Does NOT Do

- Implement feature pages (Phase 9)
- Wire real data from `@app/db` into routes (Phase 9)
- Implement reader UI — only the route shell and layout wrapper (reader logic lives in `@app/reader`, already built in Phase 6)
- Add TanStack Query query factories or prefetch logic beyond the basic client setup
- Desktop native menu integration beyond the existing main process
- Theme preview or theme switching animation beyond the existing ThemeProvider
- Motion polish beyond route transitions (Phase 11)

## Acceptance Criteria

- [ ] App shell renders with sidebar on desktop, bottom nav on mobile, and no chrome on reader route.
- [ ] All 8 core routes exist and render their shell components.
- [ ] All 7 stub routes exist, are lazy-loaded, and show descriptive EmptyStates.
- [ ] Command palette opens with `Cmd+K`, searches commands, navigates arrows, executes Enter.
- [ ] CommandRegistry supports plugin registration for Phase 9 features.
- [ ] TanStack Query provider wraps the app with configured defaults.
- [ ] PlatformProvider exposes detected capabilities to children.
- [ ] Route transitions use `@app/motion` helpers and respect reduced motion.
- [ ] Navigation preloading is enabled (`intent`).
- [ ] Electron renderer imports the web app shell and renders correctly.
- [ ] All unit and integration tests pass.
- [ ] Lint, typecheck, format pass.
- [ ] Package boundaries respected (no feature code in shell components, no raw platform access).
