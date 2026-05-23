# Phase 6: @app/reader Reader Package Design Spec

**Date:** 2026-05-16
**Status:** Implemented (Gap Fix in Progress)
**Approach:** Pure engine first, standalone package, React integration through explicit adapters

## Summary

Build `@app/reader` as a standalone manga/comic/webtoon reader package. It must own deterministic reader engines for layout, spreads, tap zones, navigation, zoom/pan, webtoon virtualization planning, preload/decode scheduling, progress events, errors, low-memory behavior, and diagnostics.

The reader must not depend on app shell routing, provider internals, database internals, Electron APIs, or global Zustand state. App routes should pass normalized chapter pages and settings in, then receive progress/navigation/error events out.

## Package Structure

```
packages/reader/src/
  index.ts              # Public exports
  types.ts             # Reader contract types
  state.ts             # createReaderState factory
  spreads.ts           # Spread calculation
  tap-zones.ts         # Tap zone calculation
  navigation.ts        # Keyboard/wheel navigation
  zoom.ts              # Zoom/pan transforms
  webtoon.ts           # Webtoon windowing
  preload.ts           # Preload/decode queue
  progress.ts          # Progress events
  diagnostics.ts       # Diagnostics snapshots
  errors.ts            # Validation helpers
```

## Public API Contract

`@app/reader` exports:

**Package:**
- `PACKAGE_NAME = '@app/reader'`
- `READER_ERROR_CODES` (runtime constant)

**Types:**
- `ReaderPage` - page with runtime metadata
- `ReaderChapter` - chapter wrapper with pageCount
- `ReaderViewport` - dimensions and orientation
- `ReaderOverlayInsets` - pixel insets from edges
- `ReaderSessionInput` - session initialization input
- `ReaderProgressEvent` - progress event emitted by engine
- `ReaderNavigationAction` - navigation action with pageIndex
- `ReaderDiagnosticsSnapshot` - safe diagnostics (no secrets)
- `TapZoneRegion` - tap zone geometry and action
- `TapZoneDebugModel` - debug overlay model
- `ZoomStateSummary` - zoom/pan state
- `PreloadPlan`, `DecodeQueue`, `PageLoadResult`
- `ReaderEngineSettings`, `ReaderState`

**Layout/spread functions:**
- `createReaderState(input) -> ReaderState`
- `calculatePageSlots(input) -> readonly PageSlot[]`
- `calculateSpreadPlan(input) -> SpreadLayout`
- `resolveInitialPageIndex(input, bookmark?) -> number`

**Tap-zone functions:**
- `calculateTapZones(input, overlayInsets, zoomState?) -> readonly TapZoneRegion[]`
- `resolveTapZoneAction(input, params) -> TapZoneAction`
- `createTapZoneDebugModel(input, regions, zoomState?, overlayInsets?) -> TapZoneDebugModel`

**Navigation functions:**
- `resolveNavigationAction(state, action) -> ReaderNavigationAction`
- `applyNavigationAction(state, action) -> ReaderState`
- `resolveKeyboardAction(event, settings) -> ReaderNavigationAction`
- `resolveWheelAction(event, settings) -> { type, delta? }`

**Zoom/pan functions:**
- `createZoomState(settings) -> ZoomStateSummary`
- `applyDoubleTapZoom(state, tapPosition, viewportW, viewportH, doubleTapZoom) -> ZoomStateSummary`
- `applyPinchZoom(state, currentScale, targetScale, center) -> ZoomStateSummary`
- `applyPan(state, deltaX, deltaY) -> ZoomStateSummary`
- `clampZoomTransform(state, pageW, pageH, viewportW, viewportH) -> ZoomStateSummary`

**Webtoon functions:**
- `calculateWebtoonWindow(input, scrollPercent, totalHeight) -> WebtoonWindow`
- `estimateWebtoonLayout(input) -> WebtoonLayout`

**Preload functions:**
- `createPreloadPlan(pages, activePageIndex, preloadAhead, lowMemoryMode) -> PreloadPlan`
- `createDecodeQueue(pages, activePageIndex, preloadAhead, lowMemoryMode) -> DecodeQueue`
- `recordPageLoadResult(result, pages, activePageIndex, failedPages, maxRetries, retryState?) -> { failedPages, preloadQueue, retryState }`

**Progress functions:**
- `createProgressEvent(chapterId, mangaId, pageIndex, totalPages) -> ReaderProgressEvent`
- `shouldPersistProgress(previous, next, policy) -> boolean`

**Diagnostics:**
- `createReaderDiagnostics(input, activePageIndex, totalPages, chromeVisible, failedPages, preloadQueueLength, visiblePageIndexes, zoomState?, lowMemoryMode?, preloadQueue?, events?) -> ReaderDiagnosticsSnapshot`

**Error validation:**
- `createReaderError(input) -> AppError`
- `validateReaderSessionInput(input) -> AppResult<ReaderSessionInput>`
- `validatePageIndex(index, pageCount) -> AppResult<number>`

## Reader State Model

Reader state is serializable, excluding high-frequency pointer state:

```typescript
interface ReaderState {
  chapterId: string;
  pages: readonly ReaderPage[];
  settings: ReaderEngineSettings;
  mode: 'scroll' | 'page';
  activePageIndex: number;
  visiblePageIndexes: readonly number[];
  layout: PageLayoutMode;
  zoom: ZoomStateSummary;
  chromeVisible: boolean;
  failedPages: readonly number[];
  preloadQueue: readonly number[];
  diagnostics: ReaderDiagnosticsSnapshot;
}
```

## Spread Rules

- `single`: one page per slot
- `double`: pair pages in reading order
- `smartSpread`: dimension-aware pairing:
  - Cover page (index 0) stands alone when `treatFirstPageAsCover: true`
  - Landscape pages (width > height) stand alone
  - Portrait pages (height >= width) pair when both available
  - Pages with missing dimensions stand alone
- Vertical mode ignores spreads, lays pages sequentially

## Tap-Zone Rules

Tap zones computed against visible interaction layer:

- `leftRight`: 2 zones (left, right)
- `lShaped`: 4 zones (left, topRight, bottomLeft, right)
- `grid`: 9 zones (3x3 grid with center = toggleChrome)

Overlay/chrome insets reduce tappable navigation area.
Zoomed state (> scale 1) disables tap navigation.
Vertical mode: side zones return `none` (no accidental page turns).

## Gesture And Zoom Rules

- Double tap toggles between base zoom and `doubleTapZoom`
- Pinch zoom clamps between `minZoom` and `maxZoom`
- Pan clamps to page bounds based on zoom and viewport
- Tap navigation suppressed after pan/pinch exceeds threshold

## Preload And Retry Rules

- Default preload uses `settings.preloadAhead`
- Low-memory mode caps preload at 1
- Vertical long-strip produces bounded visible window + preload window
- Failed pages tracked with retry counts (max 3)
- Retry state serialized as `ReadonlyMap<number, number>`

## Error Handling

Use `AppResult` for recoverable reader failures:

- `reader.input.invalid` - session input validation
- `reader.page.missing` - page not found
- `reader.layout.invalid` - layout calculation failure
- `reader.navigation.invalid` - invalid navigation
- `reader.image.failed` - image load failure
- `reader.preload.failed` - preload failure

Error details must not include image URLs or provider secrets.

## Diagnostics Rules

Diagnostics snapshot is safe for logging/UI:
- Timestamp
- Chapter/page state
- Settings (no secrets)
- Zoom/pan state
- Failed page count
- Preload queue length
- Events array (type/data only, no URLs)

## Non-Goals

- Do not build React reader UI
- Do not integrate app routes
- Do not add GSAP reader animations
- Do not persist progress to SQLite
- Do not implement provider page fetching
- Do not import React unless creating thin adapter hooks

## Acceptance Criteria

- `@app/reader` exports `PACKAGE_NAME` and `READER_ERROR_CODES`
- Pure engines cover layout, spread, tap zones, navigation, zoom/pan, webtoon windowing, preload/decode planning, progress events, retry state, low-memory behavior, diagnostics, and validation
- Reader supports RTL, LTR, and vertical modes
- Smart spread is dimension-aware (landscape stand alone, portrait pair, missing dimensions stand alone)
- `createReaderState` initializes `visiblePageIndexes` from spread/layout engine
- Vertical tap zones do not emit `prevPage` or `nextPage`
- Tap-zone debug model preserves overlay insets
- Error validation helpers use `AppResult` with `reader.*` error codes
- Preload retry tracking increments and stops at max
- All tests pass (116+)
- `pnpm --filter @app/reader test`, `typecheck`, `build` pass
- Root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` pass