# 05 — Scrollbars

Scope: every scroll container reachable from `apps/web/app`, `packages/reader`,
`packages/design-system` and `packages/extensions`; the global styling recipe; the
Windows symptom and its root cause; measured evidence; and the per-container work
that remains.

Pass constraints: styling only. No app behavior, reader layout, theme token or
component file changed. `packages/design-system/src/styles/globals.css`, one
design-system CSS test, one focused Playwright spec and this document are the only
files in this pass.

Audit branch `bugfix/app-flow-audit`; base at session start was `0c96b79e`, HEAD
moved to `961d94e9` while other agents were working in the same worktree. Their
changes (routes, `sheet.tsx`, navigation tests) are present in the build used for
the final E2E run.

---

## 1. Windows symptom and root cause

The reporter sees "default, fat, chunky" bars whose colours ignore the theme.

There was no scrollbar styling anywhere: a repository-wide search for
`scrollbar-width`, `scrollbar-color`, `::-webkit-scrollbar` found zero CSS rules.
On Windows Chromium/Electron, that means the user-agent bar:

- about 17px wide at 100% scale, square, with a light grey track and thumb;
- painted from the OS palette, not `--background`, `--surface` or `--border`;
- still light in dark mode, because the app never sets `color-scheme` and never
  supplies scrollbar colours. A dark app therefore shows a bright rail.

Two Chromium behaviours shaped the recipe:

1. `scrollbar-color` **is inherited**, so one declaration on `html` themes every
   scroller in the document.
2. `scrollbar-width` is **not inherited** in Chromium 142. Putting
   `scrollbar-width: thin` only on `html` leaves `main`, dialogs, sheets and the
   reader with the platform's fat bar. Measured before the fix: `main` had a
   `clientWidth` of 1205 against an `offsetWidth` of 1220 — a 15px bar. With the
   universal rule it is 1209 against 1220 — an 11px thin bar.

Electron is `^44.7.0`, whose Chromium supports both standard properties. Those
properties take precedence over `::-webkit-scrollbar-*` styling in Chromium
(per the CSS Scrollbars behaviour), so on Windows the standards path is what
paints; the WebKit pseudo-elements remain the fallback for older engines.

---

## 2. The recipe

Implemented in `packages/design-system/src/styles/globals.css` inside
`@layer base`:

```css
html {
  --scrollbar-thumb: color-mix(in oklab, var(--muted-foreground) 65%, transparent);
  --scrollbar-thumb-hover: var(--muted-foreground);
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

* {
  scrollbar-width: thin;
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background-color: transparent;
}

::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 9999px;
  background-color: var(--scrollbar-thumb);
  background-clip: content-box;
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover);
}

::-webkit-scrollbar-corner {
  background-color: transparent;
}

@media (prefers-contrast: more) {
  html {
    --scrollbar-thumb: var(--foreground);
    --scrollbar-thumb-hover: var(--foreground);
    scrollbar-color: var(--foreground) var(--background);
  }
}

@media (width >= 48rem) {
  [data-app-shell] > main {
    scrollbar-gutter: stable;
  }
}
```

### Token choices

| Piece                   | Value                                                                   | Why                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idle thumb              | `color-mix(in oklab, var(--muted-foreground) 65%, transparent)`         | Derived from a theme token, so all ten presets repaint it automatically. `applyThemeToRoot` writes the variables on `<html>`, which is the element the thumb resolves against. |
| Track                   | `transparent`                                                           | No bright band over `--background`, glass or page art.                                                                                                                         |
| Hover (WebKit fallback) | `var(--muted-foreground)`                                               | The full secondary ink, tied to the same token as secondary copy.                                                                                                              |
| High contrast           | `var(--foreground)` / `var(--background)`                               | Full ink/paper pair instead of the muted mix.                                                                                                                                  |
| WebKit width            | `10px` with a 2px transparent border and `background-clip: content-box` | Paints a 6px rounded thumb inside a 10px lane.                                                                                                                                 |
| Native width            | `scrollbar-width: thin` on `*`                                          | Chromium's thin lane is 11px at 100% in this build (15px before). The universal selector is required because the property does not inherit.                                    |

### Contrast (WCAG 2.x relative luminance)

The idle thumb is composited over the canvas; hover is the raw token.

| State                            | Light                               | Dark                                |
| -------------------------------- | ----------------------------------- | ----------------------------------- |
| Idle thumb                       | `#9c9793` on `#f7f5f2` — **2.66:1** | `#716d6a` on `#0c0b0a` — **3.84:1** |
| Hover thumb                      | `#6b6560` on `#f7f5f2` — **5.28:1** | `#a8a29e` on `#0c0b0a` — **7.80:1** |
| What `--border` alone would give | 1.24:1                              | 1.32:1                              |
| Windows default (reference)      | ~1.5:1                              | a light bar on dark                 |

The idle light value is deliberately below 3:1: scrollbars are browser chrome and a
3:1 rail on a parchment page reads as a heavy line. It is still well above the
default it replaces, and the hover value clears 4.5:1. Dark is above 3:1 at rest.
If the owner wants 3:1 at rest in light mode, raise the mix to 75% (3.18:1);
that is a one-token change.

`scrollbar-color` on Chromium has no pointer-hover state, so the `:hover` rule only
acts in the WebKit fallback. This is a platform limitation, not a missing rule.

---

## 3. Inventory

Measured at 1440×900 and 390×844: the **document does not scroll** in the shell at
either width. `main#main-content` is the page scroller, on phone and desktop. The
mobile shell (`max-md:overflow-visible`, `100dvh`) still gives `main` the height and
`flex-1`, so the global page scroller is one container with two width behaviours.

| #   | Container                                                                         | Location                                                                              | Kind                                               | Axis | Current handling                        | Gutter                                             |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ---- | --------------------------------------- | -------------------------------------------------- |
| 1   | `main#main-content`                                                               | `apps/web/app/layouts/AppShellLayout.tsx:60`                                          | Native page scroll (nested panel)                  | Y    | global thin + theme                     | `stable` at `md+` only                             |
| 2   | `html` / `body`                                                                   | `globals.css`, `#root`                                                                | Document fallback                                  | Y    | global thin + theme                     | none (not used; verified `documentScrolls: false`) |
| 3   | Library grid (virtual + fallback)                                                 | `features/library/components/*`                                                       | Page scroll via `find-scroll-parent` → `main`      | Y    | inherited                               | via #1                                             |
| 4   | Search/discover grid                                                              | `features/search/components/VirtualSearchGrid.tsx`                                    | Page scroll → `main`                               | Y    | inherited                               | via #1                                             |
| 5   | Chapter list (virtual + fallback)                                                 | `features/library/components/MangaChapterList.tsx`                                    | Page scroll → `main`                               | Y    | inherited                               | via #1                                             |
| 6   | Settings index/app/reader, storage, backup, onboarding, theme editor, diagnostics | `PageContainer` routes                                                                | Page scroll → `main`                               | Y    | inherited                               | via #1                                             |
| 7   | Discover category/region tabs                                                     | `features/search/components/DiscoverPage.tsx:274`                                     | Nested horizontal strip                            | X    | global thin + theme                     | none                                               |
| 8   | Base dialog body                                                                  | `packages/design-system/src/components/ui/dialog.tsx:29`                              | Nested panel, `max-h-dvh`, `overflow-y-auto`       | Y    | global thin + theme                     | none (modal is fixed/centred)                      |
| 9   | Category manager dialog                                                           | `features/library/components/CategoryManagerDialog.tsx:160`                           | Dialog with `max-h-96`                             | Y    | global                                  | none                                               |
| 10  | Migration dialog                                                                  | `features/migration/components/MigrationPage.tsx:611`                                 | Dialog with `max-h-svh`                            | Y    | global                                  | none                                               |
| 11  | Bulk-edit category list                                                           | `features/library/components/BulkEditBar.tsx:266`                                     | Nested list, `max-h-64`                            | Y    | global                                  | none                                               |
| 12  | Install/registry provider dialog bodies                                           | `packages/extensions/src/components/{InstallProviderDialog,RegistryImportDialog}.tsx` | Nested list body                                   | Y    | global                                  | none                                               |
| 13  | Command palette list                                                              | `packages/design-system/src/components/ui/command.tsx:36`                             | Nested list, `max-h-80`                            | Y    | global (asserted in E2E)                | none                                               |
| 14  | Command palette panel                                                             | same file, `Command`                                                                  | `overflow-hidden` shell                            | —    | no bar                                  | none                                               |
| 15  | Select popup list                                                                 | `packages/design-system/src/components/ui/select.tsx:114`                             | Popup                                              | —    | **clipped, not scrollable — see §6 P0** | none                                               |
| 16  | Reader settings sheet                                                             | `packages/reader/src/components/reader-settings-sheet.tsx:215`                        | Glass sheet, `overflow-y-auto`                     | Y    | global                                  | none                                               |
| 17  | Reader diagnostics events                                                         | same file:370                                                                         | Nested list, `max-h-40`                            | Y    | global                                  | none                                               |
| 18  | Reader vertical/long-strip                                                        | `packages/reader/src/components/ReaderScrollView.tsx:642`                             | Reader stage, `overflow-y-auto overscroll-contain` | Y    | global thin, themed mid-grey            | **none on purpose** (page art centring)            |
| 19  | Reader paged/zoom layer                                                           | `packages/reader/src/components/ReaderPagedLayer.tsx:68`                              | Reader stage, `overflow-auto`                      | X/Y  | global thin                             | none                                               |
| 20  | Reader layout / stage                                                             | `ReaderLayout.tsx`, `ReaderStage.tsx`                                                 | `overflow-hidden` frame                            | —    | no bar                                  | none                                               |
| 21  | Library Filters sheet                                                             | `features/library/components/LibraryToolbar.tsx:224`                                  | `SheetContent`, no body overflow                   | —    | **no scroller — see §6 P1**             | none                                               |
| 22  | Mobile "More" sheet                                                               | `components/shell/MobileBottomNav.tsx`                                                | `SheetContent`, short content                      | —    | no scroller                             | none                                               |
| 23  | Sidebar nav                                                                       | `components/shell/DesktopSidebar.tsx`                                                 | `nav` `flex-1`, no overflow                        | Y    | **none — see §6 P1**                    | none                                               |
| 24  | Textareas and native form controls                                                | everywhere                                                                            | Native inner scroller                              | Y    | global thin                             | none                                               |
| 25  | Design-system demo page                                                           | `components/design-system/DesignSystemPage.tsx`                                       | Page scroll → `main`                               | Y    | inherited                               | via #1                                             |

Not scroll containers: the reader progress rail (pointer-driven, transforms only),
the mobile bottom bar, the status/loading surfaces.

### Design exceptions

- **Reader stage**: the global thin themed bar applies; no separate colour, no
  `scrollbar-gutter`. A mid-grey 11px bar on the stage is what the reader already
  had, only thinner and no longer bright. Forcing `stable` there would indent page
  art and shift the fit calculation; forcing `overflow: hidden` would remove the
  only position cue in long-strip mode. Page art keeps the full width.
- **Page gutter**: only `[data-app-shell] > main` at `md+`. On 390 the gutter stays
  `auto`; reserving 11px of a 390px screen for an overlay bar would be waste, and
  measured client width remains 390 with no horizontal overflow.
- **Dialogs/sheets**: no gutter. They are fixed and centred; modal open/close does
  not reflow the page. If a future dialog swaps between a short and a tall tab,
  `scrollbar-gutter: stable` on `DialogContent` is the targeted fix.
- **Horizontal tabs**: one thin bar, no gutter; the strip is not part of the page's
  vertical rhythm.

---

## 4. Measured evidence

Focused Playwright run (`apps/web/e2e-production/scrollbars.spec.ts`), production
build, Chromium with classic scrollbars laid out for measurement:

| Viewport | Scroller                          | `scrollbar-width` | `scrollbar-color` (computed)                                    | Gutter   | Client width                       | Horizontal overflow |
| -------- | --------------------------------- | ----------------- | --------------------------------------------------------------- | -------- | ---------------------------------- | ------------------- |
| 1440×900 | `main` (document does not scroll) | `thin`            | `oklab(0.503655 0.00508779 0.00970784 / 0.65) rgba(0, 0, 0, 0)` | `stable` | 1209 / offset 1220 = 11px reserved | 0                   |
| 390×844  | `main`                            | `thin`            | same                                                            | `auto`   | 390                                | 0                   |

Additional assertions in the same run:

- Hiding the page frame at 1440 leaves `main.clientWidth` at 1209 → the stable
  gutter prevents a content shift when the page gets short.
- The command-palette list reports `overflow-y: auto`, `scrollbar-width: thin` and
  the same themed colour — a nested panel inherits the recipe.
- Toggling the real theme button changes the computed `scrollbar-color`; light and
  dark resolve different values, so no fixed grey survives.
- At 390 the page scroller is still `main`, not the document; `gutter: auto`.
- No horizontal overflow at either width.

Screenshots (`docs/audit/05-scrollbars/`):

| File                       | What it shows                                          |
| -------------------------- | ------------------------------------------------------ |
| `settings-1440-top.png`    | 1440 settings page, stable gutter, no horizontal shift |
| `settings-1440-bottom.png` | Scrolled to the end of the same page                   |
| `settings-1440-dark.png`   | Dark theme after the toggle; same layout               |
| `settings-390-top.png`     | 390 settings page, no reserved gutter                  |
| `settings-390-bottom.png`  | Scrolled to the end on phone                           |

macOS paints overlay scrollbars, which the screenshot does not capture even with
`--disable-features=OverlayScrollbar`; the computed values above are the machine
evidence. The visible Windows bar is the owner check in §7.

Reader note: the reader spec was **not** driven in this pass (it needs a seeded
chapter and provider flow). Its scroll views are ordinary scroll containers under
`html`, so they inherit both properties; a Windows reader screenshot remains part
of the owner check.

---

## 5. Files in this pass

- `packages/design-system/src/styles/globals.css` — the recipe (no token edits, no
  component changes).
- `packages/design-system/src/__tests__/scrollbar-styles.test.ts` — pins the
  recipe: derived token, universal thin width, WebKit fallback, high-contrast
  branch, md-only gutter.
- `apps/web/e2e-production/scrollbars.spec.ts` — computed check at 390/1440,
  nested palette list, theme toggle, content-shift guard. Screenshots are written
  only when `SCROLLBAR_AUDIT_DIR` is set; CI keeps the assertions.
- `docs/audit/05-scrollbars.md` and `docs/audit/05-scrollbars/*.png`.

---

## 6. Remaining per-container work, ranked

### P0 — Select popup clips its options (pre-existing, not from this pass)

`packages/design-system/src/components/ui/select.tsx:114` renders the popup with
`max-h-96 overflow-hidden`, and `Select.List` gets `select-anchor-size` when
`position === 'popper'`. That utility is `height: var(--anchor-height)`. Measured on
`/settings/app`: five options, list `scrollHeight 164`, `clientHeight 40`, popup
42px tall, `overflow: hidden` — the extra options are clipped, not scrollable.
This is a functional bug independent of scrollbar styling, but it is also the one
scroll container that currently cannot scroll at all. Fix in the select work (drop
the height from the popper class, or give the list `max-height` +
`overflow-y: auto`), then the global thin recipe applies unchanged. Not touched
here because component files are outside this pass.

### P1 — Two sheet/nav containers have no scroller (owner files)

- `LibraryToolbar` Filters sheet (`SheetContent side="right"`) and the mobile More
  sheet: the body has no `overflow-y-auto`. The filters form is close to the
  viewport height; on a short landscape window it can clip. Add
  `min-h-0 overflow-y-auto` to the content body.
- `DesktopSidebar` nav: `flex-1` with `overflow: visible`. At 480px height it fits
  (nav 339px); the content is a fixed ~339px, so a shorter window makes the nav
  clip into the footer because it cannot scroll. Add `min-h-0 overflow-y-auto` to
  the nav. `DesktopSidebar.tsx` is owned by another agent in this worktree — do
  not edit it in this pass.

### P2 — Reader stage feel (owner decision)

The global bar is a mid-grey 11px bar, no track. If the owner wants it to fade
while reading, that is a reader interaction (hide until scroll, or a custom
overlay), not a CSS colour tweak; it must not change the strip layout or add
`scrollbar-gutter`. Verify on Windows that the bar over dark art is acceptable
before considering more.

### P2 — `color-scheme`

The app never declares `color-scheme`. Scrollbars are fixed by the rules above,
but native widgets and the pre-CSS first paint still use the light scheme in dark
mode. Setting `color-scheme: dark` on `.dark` would make native controls and the
fallback scrollbar consistent; it is a broader theming change and is deliberately
not in this styling-only pass.

### P3 — Gutter on dialog bodies

Only if a dialog starts swapping short/tall panels; use a `stable` gutter there,
not a global one.

### P3 — Windows hover

If a pointer-hover thumb is required on Windows, the standards path must be
dropped in favour of `::-webkit-scrollbar` only. That trades standards compliance
and `scrollbar-color` theme propagation for hover; not recommended without an
owner decision.

---

## 7. Commands and results

Run from the worktree root unless noted.

| Command                                                                                                                                                                          | Exit | Result                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec oxfmt --check packages/design-system/src/styles/globals.css packages/design-system/src/__tests__/scrollbar-styles.test.ts apps/web/e2e-production/scrollbars.spec.ts` | 0    | All three files formatted.                                                                                                                                                                                                         |
| `pnpm format:check`                                                                                                                                                              | 1    | Only `docs/audit/02-reader.md`, `docs/audit/03-discover-provider.md`, `docs/audit/04-settings-actions-ui.md` from other agents. This document and the CSS/spec files pass.                                                         |
| `pnpm lint`                                                                                                                                                                      | 0    | oxlint + both state baselines (254 frozen uses in 94 files). Existing test-file warnings only.                                                                                                                                     |
| `pnpm typecheck`                                                                                                                                                                 | 0    | 19/19 turbo tasks; web build included.                                                                                                                                                                                             |
| `pnpm --filter @app/design-system test`                                                                                                                                          | 0    | 38 files, 350 tests, including the new scrollbar recipe test.                                                                                                                                                                      |
| `pnpm run doctor`                                                                                                                                                                | 1    | Not from this pass: `react-hooks-js/refs` at `apps/web/app/routes/settings.app.tsx:73` (another agent's in-progress edit). The scrollbar spec's `no-console` findings were removed; re-run is clean of scrollbar findings.         |
| `pnpm knip`                                                                                                                                                                      | 1    | Not from this pass: `apps/web/playwright.navigation-local.config.ts` and 10 `SettingsModule` types, all another agent's files. No scrollbar file is listed.                                                                        |
| `pnpm exec playwright test --config playwright.production.config.ts e2e-production/scrollbars.spec.ts` (from `apps/web`, `SCROLLBAR_AUDIT_DIR` set)                              | 0    | 2/2 passed in the final run; screenshots written. An earlier run hit a transient onboarding `Continue` timeout while other agents were editing; the manual production server and the final run both completed onboarding normally. |

Servers were stopped after each run.

---

## 8. Windows owner verification

Not reproducible on macOS. On a Windows desktop build:

1. Light theme, `/settings` at 1440×900: the right bar is thin (~11px), the thumb
   is warm grey (`--muted-foreground` mixed 65%), the track is invisible.
2. Dark theme: the thumb becomes the dark theme's grey; no white strip or bright
   track anywhere.
3. `/library` with a long grid, `/search`, `/discover`: one consistent bar; no
   horizontal shift when switching between short and long pages.
4. Open the command palette (`Ctrl+K`) and scroll the list: thin themed bar inside
   the palette, no fat bar.
5. Open a dialog and the library Filters sheet at a short window height: the
   dialog scrolls; the sheet gap from §6 P1 is confirmed or fixed.
6. Reader, long-strip mode: the bar is thin and unobtrusive over the art; the
   page is not indented and zoom/page fit did not change.
7. 390px window on the web build: no reserved gutter, no horizontal overflow, bar
   still thin.
8. A second monitor at 150% DPI: confirm the bar scales with the OS and stays thin.
9. Library Filters sheet on a 390×600 landscape window (the P1 gap).

If any Windows bar still looks like the OS default, confirm Electron ≥ 44 /
Chromium ≥ 121 is what the packaged app ships; the standards path requires it for
`scrollbar-width`/`scrollbar-color`.
