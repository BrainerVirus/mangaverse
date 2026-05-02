# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Web + Desktop platform support** (feature branch `feat/web-desktop-migration`)
- `lib/platform.ts` — unified platform detection (`PlatformInfo`) replacing `Platform.OS`
- Platform abstraction layer (`services/platform/`) — storage (AsyncStorage/idb-keyval), filesystem (expo-file-system/IndexedDB), secure store (expo-secure-store/localStorage), database (expo-sqlite/sql.js WASM)
- Responsive sidebar navigation (`components/ui/Sidebar.tsx`) — collapsible sidebar on desktop, bottom tabs on mobile
- Platform-agnostic UI components: `BlurBackground`, `GradientWrapper`, `SafeAreaWrapper`
- Tauri v2 desktop support (`src-tauri/`) — cross-platform native desktop app
- Keyboard shortcuts for desktop: `Cmd+K` search, `Cmd+,` settings, `Cmd+B` sidebar, arrow keys for reader
- Desktop scrollbar styling, selection colors, Tauri drag region utilities
- `sql.js` for SQLite on web/desktop (same schema as expo-sqlite)
- `idb-keyval` alternative — custom IndexedDB wrapper for key-value storage
- Expo web export scripts: `npm run web:export`, `npm run desktop:dev`, `npm run desktop:build`

### Changed

- Replaced `NativeTabs` → Expo Router `<Tabs>` (works on web)
- Replaced all `Platform.OS` checks with `PlatformInfo`
- Replaced `expo-blur` with CSS `backdrop-filter` via `BlurBackground`
- Replaced `expo-linear-gradient` with CSS gradients via `GradientWrapper`
- Replaced `contentInsetAdjustmentBehavior="never"` → `"automatic"` (15 files)
- Migrated all services to platform abstraction layer (db, auth, extensions, downloads, backups)
- Zustand stores now use platform storage adapter instead of direct AsyncStorage imports
- App config: `"orientation": "default"`, web PWA config, `EXPO_PUBLIC_SUPPORTS_DESKTOP`

### Fixed

- Zustand `import.meta.env` patched for web builds (Metro non-module context)
- `pointerEvents` moved from props to `style` (react-native-web v0.21 deprecation)
- sql.js WASM loading configured with proper `locateFile` and Metro asset extensions
- `idb-keyval` ESM module issue — replaced with custom IndexedDB wrapper

## [1.0.0] - 2026-05-01

### Changed

- Updated dependencies to latest compatible versions

### Added

- AGENTS.md with project conventions for AI coding assistants
