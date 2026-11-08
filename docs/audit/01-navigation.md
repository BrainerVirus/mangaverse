# Audit 01 — Navigation and the back stack

Branch `bugfix/app-flow-audit`, base main `0c96b79e`. Read-only audit: no source was changed.

User report (Windows desktop): open a title from Library or Discover, read a chapter, close the
reader, press Back. Expected: return to Library or Discover, wherever the title was opened from.
Actual: the app reopens the title's reader instead of going back.

**Summary.** The bug is reproducible on the web build at 390 and 1440 px, from every origin
(Library, Discover, Search, Continue reading, deep link). There is one root cause. Closing the reader
adds a **new** `/manga/$id` history entry with `navigate()` (a push). It does not return to the
detail entry the reader was opened from. The detail page's Back calls `history.back()`, which lands
on the reader entry just under it. From there the user is caught in a loop between the detail page
and the reader. The Electron renderer uses the same router and the same default browser history
(`apps/desktop/src/renderer/src/App.tsx:5` → `getRouter()`), making a shared cause likely; the
Windows desktop behavior itself remains unverified.

---

## 1. Observed and reproduced bugs

### How it was reproduced

- A temporary Playwright spec ran against the existing production web build (`node .output/server/index.mjs`) with the
  suite's `quickOnboarding` and `mockMangaDex` fixtures and reduced motion. Both the spec and the config were
  removed afterwards. A copy of the spec is kept at `/tmp/mangaverse-nav-audit/zz-nav-audit.spec.ts.txt`.
- After every step it recorded `location`, `history.length` and TanStack's `history.state.__TSR_index`,
  and took a screenshot. The full log is at `/tmp/mangaverse-nav-audit/log.txt`, with screenshots at
  `/tmp/mangaverse-nav-audit/<flow>-<vp>-<step>.png`. These files are outside the repo and temporary.
- 10 flows passed as probes (8 + 2): Library, Search and Discover origins at 390 and 1440, plus a reader
  deep link, a detail deep link, Continue reading, and Discover with a reload. The desktop app was not
  run (see §6).
- Commands, from `apps/web`: `npx playwright test --config zz-nav-audit.config.ts` (8 passed), then
  `npx playwright test --config zz-nav-audit.config.ts -g "continue-reading|reload then back"`
  (2 passed). The temporary config served the pre-existing `.output` on port 5291. These probes
  recorded actual outcomes rather than asserting the desired fix; they are not regression tests.

### B1 — Back after closing the reader reopens the reader (the reported bug). Severity: high

- **Code:** `apps/web/app/routes/reader.$chapterId.tsx:301-307` (`handleClose` →
  `navigate({ to: '/manga/$id' })`, a push) together with `apps/web/app/routes/manga.$id.tsx:328-334` →
  `goBackOrLibrary` (`apps/web/app/queries/manga-detail-route-helpers.ts:285-295`), which calls
  `router.history.back()` whenever `__TSR_index !== 0`.
- **Steps (web or desktop, any width):**
  1. Library (or Discover, or Search) → click a title card.
  2. Click a chapter row → the reader opens.
  3. Close the reader with the ← "Close reader" button, Escape, the hidden-chrome "Close reader" button,
     the "Chapter complete" dialog's Close, or a page error's "Back". All five call the same `onClose`.
  4. On the detail page, press **Back** (or the OS/browser back).
- **Expected:** step 4 lands on the list from step 1, and the history depth does not grow.
- **Actual:** step 4 opens `/reader/<same chapter>` again. Closing again pushes another detail entry, and
  Back reopens the reader again: a loop if the user repeats those two controls. Browser Back from the
  reopened reader can still traverse the earlier detail entry and eventually reach the list.

History captured at 1440 px from Discover (the 390 px run and the Library and Search origins match index for index):

| Step             | URL                   | `history.length` | `__TSR_index`              |
| ---------------- | --------------------- | ---------------- | -------------------------- |
| 01 Discover      | `/discover`           | 4                | 0                          |
| 02 open title    | `/manga/dev-md-…`     | 5                | 1                          |
| 03 open chapter  | `/reader/dev-md-ch-…` | 6                | 2                          |
| 04 Close reader  | `/manga/dev-md-…`     | **7**            | **3** ← push               |
| 05 Back (detail) | `/reader/dev-md-ch-…` | 7                | **2** ← reopens the reader |

Library origin, 390 px (`lib-390-*`): `…03 reader idx2 → 04 close idx3 → 05 Back → /reader idx2 →
06 Escape → /manga idx3 → 07 Back → /reader idx2 → 08 browser back → /manga idx1`. In the stack
`[/library, /manga, /reader, /manga*]`, Back alternates between indexes 2 and 3 indefinitely.
Screenshots: `lib-390-05-after-back1.png` (the reader reopened), `discover-1440-04-after-close.png`.

### B2 — "Continue reading" in Library: Back reopens the reader too. Severity: high

`apps/web/app/routes/library.tsx:84-90` pushes `/reader/$chapterId` directly. Close then pushes a detail
page the user never visited, and Back lands on the reader (`continue-1440-*`:
`/library 0 → /reader 1 → Escape → /manga 2 → Back → /reader 1`). The user never reaches Library again
through Back.

### B3 — A reader opened from a deep link: Back reopens it. Severity: medium

Fresh tab on `/reader/<id>` (`deep-reader-*`): `idx0 → Escape → /manga idx1 (push) → Back → /reader idx0`.
`canGoBack()` is true because the close itself made index 1. The same applies to a Windows protocol or
OS deep link, the command palette's "recent chapter" (`useLocalCommands.ts:85`), and a reload followed by
close (`discover-reload-1440-04..06`).

### B4 — Search origin loses the query on return. Severity: medium

`apps/web/app/routes/search.tsx:72-83`. `?q` is read once as the initial state, and typing never writes
it back to the URL. The view state is component `useState`. Returning to `/search` (`search-1440-07`,
`search-390-07`) shows an empty box and "Recent searches", not the results the user came from. Screenshot:
`search-1440-07-browser-back2.png`.

### B5 — The detail page's Back fallback pushes `/library`. Severity: low

`manga.$id.tsx:332`. A detail page opened by deep link (`deep-detail-*`: `idx0 → Back → /library idx1`)
leaves itself under `/library`, so OS back reopens the detail page. The not-found state labels the same
callback "Back to library" (`MangaDetailPage.tsx:1219-1221`), but it calls `history.back()` and can land
anywhere.

### Found in code and not run (high confidence from reading the code)

- **B6 Next/previous chapter push.** `reader.$chapterId.tsx:295-300`. Each chapter is its own history entry.
  After reading chapters 1→2→3, close + Back lands on chapter 3 and OS back walks through every chapter.
  Even after B1 is fixed, a close implemented as `history.back()` would land on chapter 2. The fixture's
  two chapters are both numbered "1", so this was not exercised.
- **B7 The Library view state is not restored.** `library.tsx:73`. The filter, sort, category and selection
  are in `useState(DEFAULT_LIBRARY_VIEW_STATE)` and reset when the user returns from a title.
- **B8 Scroll position is not restored.** `router.tsx:36` enables `scrollRestoration`, but the scroller is
  `<main class="overflow-auto">` (`AppShellLayout.tsx:56-61`), which has no `data-scroll-restoration-id`. TanStack
  only restores the window and tagged elements. Not verified at runtime.
- **B9 Discover section Back pushes.** `discover.tsx:225-231`. "See all" → Back pushes `?provider`, so OS back
  returns to the expanded section. This is the same class of bug as B1.
- **B10 Merge pushes onto a deleted title.** `manga.$id.tsx:400-404` pushes the merge target, and
  `identity-merge.ts:1087` deletes the source identity. Back then lands on `/manga/<deleted id>`
  ("manga not found"). A provider-backed id may instead re-hydrate a duplicate (unverified).
- **B11 Other fixed-target "Back" controls that push.** Extension detail Back → `/extensions`
  (`extensions.$providerId.tsx:156`). Status pages "Back to library" `<Link>` (`StatusPages.tsx:6-11`).
  Onboarding finish → `/library` (`onboarding.lazy.tsx:199,224`). In each case OS back then returns to the
  page that was "left".

---

## 2. Navigation inventory

Router: `createRouter` with no `history` option, so `createBrowserHistory` on web and on Electron's
`app://` (`router.tsx:25-38`, `apps/desktop/src/renderer/src/App.tsx:5`). `defaultPreload: 'intent'`.
`/` redirects to `/discover` in `beforeLoad` (`routes/index.tsx:6-8`). `canGoBack()` is
`state.__TSR_index !== 0` (`@tanstack/history`). Browser-history initialization assigns index 0 only
when the current entry lacks a TanStack history key; an existing keyed entry retains its state, including
on reload. A fresh external entry without that key starts at 0, even if the browser has earlier entries.

### Entry points (all are `navigate` pushes unless noted)

| From                                | Control                                                          | Target                                                             | Code                                                                           |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Library grid / Recently updated     | card click                                                       | `/manga/$id`                                                       | `library.tsx:77-83`, `VirtualLibraryGrid.tsx:88`, `LibrarySections.tsx:124`    |
| Library Continue reading            | card click                                                       | `/reader/$chapterId`                                               | `library.tsx:84-90`, `LibrarySections.tsx:69-72`                               |
| Discover feed / section             | card click                                                       | `/manga/$id`                                                       | `discover.tsx:221`                                                             |
| Discover                            | provider tab / See all                                           | `/discover?provider[&section]`                                     | `discover.tsx:216-224`                                                         |
| Search                              | result card                                                      | `/manga/$id`                                                       | `search.tsx:242`                                                               |
| Detail                              | chapter row / Start-Continue reading                             | `/reader/$chapterId`                                               | `manga.$id.tsx:335-337`, `MangaDetailPage.tsx:578`, `MangaChapterList.tsx:240` |
| Detail                              | related / recommended title                                      | `/manga/$id`                                                       | `manga.$id.tsx:390-392`                                                        |
| Detail                              | merge completed                                                  | `/manga/<target>`                                                  | `manga.$id.tsx:400-404`                                                        |
| Detail                              | Migrate / Provider settings / Reader settings                    | `/migration?source` / `/extensions/$id` / `/settings/reader?title` | `manga.$id.tsx:377-383`                                                        |
| Reader                              | Next / Previous chapter (buttons, keys, chapter-complete dialog) | `/reader/$chapterId`                                               | `reader.$chapterId.tsx:295-300`, `use-reader-listeners.ts:81-86`               |
| Command palette                     | Discover / Library / Search / Settings / …                       | fixed route                                                        | `CommandPalette.tsx:48-139`                                                    |
| Command palette                     | recent title / recent chapter                                    | `/manga/$id` / `/reader/$chapterId`                                | `useLocalCommands.ts:84-85`                                                    |
| Sidebar / bottom nav / "More" sheet | `<Link>`                                                         | fixed route                                                        | `DesktopSidebar.tsx:23`, `MobileBottomNav.tsx:30,83`, `nav-items.ts`           |
| Onboarding gate                     | unfinished onboarding                                            | `/onboarding` (**replace**)                                        | `OnboardingGate.tsx:24-36`                                                     |
| Deep link / reload / Electron start | URL                                                              | any route                                                          | `app://` index fallback (`ARCHITECTURE.md:484`)                                |

### Back and close controls

| Control                                     | Where      | Current target                                      | Code                                                                                          |
| ------------------------------------------- | ---------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Reader ← "Close reader" (chrome)            | reader     | push `/manga/<mangaId>`; push `/library` if no data | `reader-chrome.tsx:153-162` → `reader.$chapterId.tsx:301-307`                                 |
| Escape                                      | reader     | same `onClose`                                      | `use-reader-listeners.ts:50-53`                                                               |
| Hidden-chrome "Close reader"                | reader     | same                                                | `ReaderOverlays.tsx:136-148`                                                                  |
| Gate (loading/error/offline) "Close reader" | reader     | same                                                | `ReaderScreen.tsx:250-256`                                                                    |
| Chapter complete → "Close reader"           | reader     | same                                                | `ReaderOverlays.tsx:262-265`                                                                  |
| Page error "Back"                           | reader     | same (`onBack={onClose}`)                           | `ReaderStage.tsx:110,129`, `CachedPageImage.tsx:138-141`                                      |
| Detail "Back" (header, loading, error)      | detail     | `history.back()` if index ≠ 0, else push `/library` | `MangaDetailPage.tsx:421,1162-1166,1199,1211`, `manga.$id.tsx:328-334`                        |
| Detail not-found "Back to library"          | detail     | same callback (history.back)                        | `MangaDetailPage.tsx:1216-1222`                                                               |
| Discover section "Back"                     | discover   | push `?provider` or `{}`                            | `DiscoverPage.tsx:120`, `discover.tsx:225-231`                                                |
| Extension detail "Back to extensions"       | extensions | push `/extensions`                                  | `extensions.$providerId.tsx:156`                                                              |
| Onboarding "Back"                           | onboarding | previous step (state, no history)                   | `onboarding.lazy.tsx:227-233`                                                                 |
| Not found / route error "Back to library"   | any        | `<Link to="/library">` push                         | `StatusPages.tsx:6-11`                                                                        |
| OS/browser back (Alt+←, mouse back, swipe)  | any        | `history.back()`                                    | browser; Electron has **no** `app-command` handler (`apps/desktop/src/main/index.ts:141-182`) |

No explicit origin context is passed to detail or reader: the earlier origin remains in the browser
stack, but reader-close pushes a new detail entry above the reader. No search param or app-defined
history state carries the origin.

---

## 3. Intended state machine

### States

- `List(l, view)` with `l ∈ {library, discover, search}`. `view` is the page's restorable state: the Library
  filter and sort, Discover `provider`/`section`, Search `q` and filters, and the scroll offset.
- `Detail(m, opener)`: `opener` is the entry below in history (a list, another detail page, or none for a
  deep link).
- `Reader(m, c, opener)`: one history entry per reading session, whatever the chapter.
- `Other(route)`: settings, extensions, migration and so on.
- `NotFound`, `RouteError`, `DetailMissing(m)`, `ReaderMissing(c)`.

### Events, guards and effects

| Event                                                             | Guard                                             | Transition / history effect                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenManga(m)                                                      | from List or Detail(m'≠m)                         | **push** `Detail(m, opener=cur)`                                                                                                                                                 |
| OpenChapter(c)                                                    | from Detail(m)                                    | **push** `Reader(m, c)` with state `{ readerSession: true }`                                                                                                                     |
| ContinueReading(c)                                                | from List(library) or palette                     | **push** `Reader(m, c)` with the same state                                                                                                                                      |
| Next/PrevChapter                                                  | Reader, neighbour exists                          | **replace** `Reader(m, c±1)`, carrying the state. Progress is checkpointed first.                                                                                                |
| CloseReader (button, Esc, hidden exit, gate, dialog, page "Back") | Reader with `readerSession` state and `canGoBack` | `history.back()` → the opener (Detail(m) or List)                                                                                                                                |
| CloseReader                                                       | no trusted session state (e.g. a fresh deep link) | **replace** with `Detail(m, opener=none)`. If the chapter is missing, **replace** with `List(library)`. Reload of a marked reader entry should retain its state where supported. |
| DetailBack                                                        | `canGoBack`                                       | `history.back()`                                                                                                                                                                 |
| DetailBack                                                        | `!canGoBack` (deep link)                          | **replace** `List(library)`                                                                                                                                                      |
| SectionBack                                                       | entry below is the Discover feed                  | `history.back()`, else **replace** `?provider`                                                                                                                                   |
| Merge(m→t)                                                        | Detail(m)                                         | **replace** `Detail(t)` (m no longer exists)                                                                                                                                     |
| SystemBack / Forward                                              | —                                                 | browser pop; every page restores `view` from its URL or state                                                                                                                    |
| Reload                                                            | —                                                 | same entry and stack; pages restore from the URL, and `canGoBack` keeps the index                                                                                                |
| DeepLink / cold start                                             | —                                                 | new stack of one entry. `/` → **replace** `/discover`.                                                                                                                           |
| Sidebar / palette to a list                                       | —                                                 | push (a new top-level visit)                                                                                                                                                     |
| Not found / route error                                           | —                                                 | "Back to library" **replaces** the broken entry                                                                                                                                  |

Side effects at the reader boundary: the progress checkpoint runs on unmount, as it does today, and the
library is marked stale (`reader.$chapterId.tsx:213-235`). Neither depends on the kind of history
operation.

**Open product choice (needs an owner decision).** When the reader was opened straight from a list
(Continue reading, the palette), should Close return to that list (`history.back()`) or show the
title's detail page? Recommendation: return to the opener, consistent with the user's stated
origin-aware expectation. The existing E2E assertions that Close lands on `/manga/…`
(`reader-audit.spec.ts:142,254`, `reader-features.spec.ts:35`) open the reader from the detail page,
so they hold under either choice.

---

## 4. TLA+ model proposal

A sibling harness already exists at `tla/Navigation.tla` (untracked in this worktree; `Impl ∈
{"current","fixed"}`). This proposal extends it rather than replacing it.

**Variables:** `hist` (sequence of entries `[k, m, c, s, o]`), `idx`, `last`, `prev` (as in the
existing harness), plus:

- `routerIndex` on each entry, distinct from the browser's physical history index: a previously keyed
  entry retains its index on reload, while an unkeyed external entry initializes to zero.
- `rs` on each reader entry: the reader-session flag carried in history state.
- `q` on list entries: whether the restorable view (Search `q`, Library filter) is in the URL or state.
- `alive ⊆ Manga`: titles that still exist (merge deletes).

**Actions:** `Sidebar(l)`, `OpenManga(m)`, `OpenRelated(m)`, `OpenChapter(c)`, `ContinueReading(m)`,
`PaletteChapter(m,c)`, `ChapterStep(±1)`, `ReaderClose`, `MangaBack`, `SeeAll`, `BackFromSection`,
`Merge(m,t)`, `SystemBack`, `SystemForward`, `Reload` (preserves a keyed entry's state), and `DeepLink(p)`
(a fresh entry starts with `routerIndex=0`, modelling a new document in the same tab).
Each action cites the file:line from §2. `Impl="current"` encodes push for close, chapter step, the
fallback and merge. `Impl="fixed"` encodes the §3 table.

**Invariants and properties:**

- `TypeOK`, and `HistoryConsistent`: `idx ∈ 1..Len(hist)`; each keyed entry has a nonnegative
  `routerIndex`; a chapter-step replacement preserves the entry's session marker and router index.
  Scope the no-adjacent-reader condition to chapter steps in the _same session_: unrelated explicit
  openings and browser forward entries must not produce false positives.
- `BackFromReaderReturnsToOrigin == (last = "ReaderClose" ∧ prev.rs) ⇒ cur = hist_before[idx_before − 1]`.
  This is stated as an action property: close lands on exactly the entry under the reader.
- `NoSelfReopen`: after `ReaderClose`, a subsequent in-app `MangaBack` must not return to the closed
  reader session. Track the closed session ID and the relevant opener, not just a manga ID: a prior
  intentional visit to the same title can legitimately remain deeper in history.
- `OriginBack` (as in the existing harness): `MangaBack` from a detail page opened from list `l` lands on `l`, even after any
  sequence of OpenChapter, ChapterStep and ReaderClose.
- `ReturnDoesNotGrow`: `ReaderClose`, `MangaBack` and `BackFromSection` do not increase the current
  logical index; check replacement and pop separately. A browser pop preserves physical history length
  and forward entries, so length alone is not sufficient.
- `ReaderBackExitsReader` (existing): OS back from a reader leaves that title's reader.
- `NoBackIntoDeleted == last = "MangaBack" ⇒ (cur.k = "manga" ⇒ cur.m ∈ alive)` (B10).
- `ListViewRestored == (cur.k ∈ Lists ∧ last ∈ {"MangaBack","SystemBack","ReaderClose"}) ⇒ cur.q = 1` (B4/B7).
- Liveness (optional, with weak fairness on `MangaBack`/`ReaderClose`): `Reader ~> List`. From any
  reader, repeated in-app Back reaches a list.

**Finite configurations:**

| Config         | Constants                                                          | Purpose                                                                                            |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `cur-min`      | Impl=current, DeepLinks=FALSE, Manga={1}, MaxChapter=1, MaxHist=5  | Smallest counterexample to `NoSelfReopen`/`OriginBack`: discover→manga→reader→close→back (depth 4) |
| `cur-chapters` | Impl=current, Manga={1}, MaxChapter=3, MaxHist=6                   | Breaks `HistoryConsistent` (B6)                                                                    |
| `cur-deeplink` | Impl=current, DeepLinks=TRUE, Manga={1,2}, MaxChapter=2, MaxHist=5 | B3/B5 fallbacks                                                                                    |
| `fixed-full`   | Impl=fixed, DeepLinks=TRUE, Manga={1,2}, MaxChapter=2, MaxHist=7   | Proposed invariants should hold; measure runtime and review counterexamples                        |
| `fixed-merge`  | Impl=fixed, Manga={1,2}, MaxChapter=1, MaxHist=6, with Merge       | `NoBackIntoDeleted`                                                                                |

Use the state constraint `HistoryBound`, with `Manga` as a symmetry set in the fixed configurations. Each
`current` configuration should yield its counterexample, and the `fixed` ones must pass.

---

## 5. Root-cause hypotheses and proposed fixes (ranked; not implemented)

1. **(Confirmed root cause of B1–B3.) Reader close pushes a new detail entry.**
   `reader.$chapterId.tsx:301-307`. Fix: set history state `{ readerSession: true }` on every navigation
   into the reader (`manga.$id.tsx:335-337`, `library.tsx:84-90`, `useLocalCommands.ts:85`). On close,
   call `router.history.back()` when that state is present and `canGoBack()`, otherwise
   `navigate({ to: '/manga/$id', replace: true })` (`/library` with `replace` when there is no data).
   Type the state by augmenting `HistoryState`.
2. **(Confirmed by code; required alongside 1.) Chapter steps push.** `reader.$chapterId.tsx:295-300`.
   Fix: `navigate({ …, replace: true, state: (s) => s })` so the session stays one entry and keeps its
   marker. Without this, fix 1 makes Close land on the previous chapter.
3. **The detail Back fallback pushes.** `manga.$id.tsx:332`. Fix: `navigate({ to: '/library', replace: true })`.
   Either rename the not-found action "Back" or make it always replace with `/library`.
4. **List view state lives in component state.** Search: write `q` (and the filters) to the URL with
   `replace` as the debounced query settles, and stop re-keying `SearchRouteContent` on `q`
   (`search.tsx:72-75`). Library: move `LibraryViewState` to validated search params or a small store
   (`library.tsx:73`). Scroll: add `data-scroll-restoration-id` to the `<main>` scroller and check it
   against the virtualized grids (`AppShellLayout.tsx:56-61`).
5. **Other "Back" controls that push.** Discover section Back (`discover.tsx:225-231`): `history.back()`
   when the entry below is the feed, else `replace`. Merge (`manga.$id.tsx:400-404`): `replace`.
   Extension detail and status pages: `history.back()` with a `replace` fallback.
6. **Electron OS back (Windows mouse XButton1 / Alt+←).** Main has no `app-command`
   (`browser-backward`/`browser-forward`) handler. Decide whether to support it. If so, map it to
   `webContents.navigationHistory.goBack()` behind the same in-app rules. Not tested; see §6.

### Tests that must fail on the old code and pass after the fix

Route-level tests use a memory history, following `apps/web/app/__tests__/routes/theme-routes.test.tsx`.
Each pre-seeds `initialEntries` and asserts both `location.pathname` and `history.length` / `__TSR_index`.

| #   | Scenario                                                                                                                                 | Old (fails)                           | New (passes)                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| T1  | `[/discover,/manga/m,/reader/c]` at index 2 → Close reader, then detail Back. Parametrized: Library, Search, Discover; button and Escape | index 3, then `/reader/c`             | `/manga/m` at index 1, then `/discover` at index 0                                                                     |
| T2  | the same + Next chapter, then Close                                                                                                      | Close at index 4; Back → `/reader/c2` | the chapter step replaces; Close → `/manga/m` at index 1                                                               |
| T3  | `[/reader/c]` deep link → Close → Back                                                                                                   | Back → `/reader/c`                    | Close replaces → `/manga/m` at index 0; Back replaces → `/library`                                                     |
| T4  | `[/library,/reader/c]` Continue reading → Close                                                                                          | `/manga/m` pushed; Back → reader      | `/library` at index 0 (if the §3 choice is "opener")                                                                   |
| T5  | `[/manga/m]` deep link → Back                                                                                                            | `/library` at index 1                 | `/library` at index 0 (replace)                                                                                        |
| T6  | `/search`, type "berserk" → open a result → Back                                                                                         | empty searchbox                       | `?q=berserk` and results restored                                                                                      |
| T7  | Library with a non-default filter → title → Back                                                                                         | filter reset                          | filter kept                                                                                                            |
| T8  | Production E2E at 390 and 1440 (the §1 probe as a real spec) for Library, Discover and Search                                            | after Back the URL is `/reader/…`     | the origin URL, with logical index decreased and no new close entry; browser history length may retain forward entries |
| T9  | Merge from m into t → Back                                                                                                               | `/manga/m` not found                  | does not land on m                                                                                                     |
| T10 | TLA+ `cur-*` configurations                                                                                                              | counterexample found                  | the `fixed-*` configurations pass                                                                                      |

The existing E2E assertions that Close lands on `/manga/<id>` should stay green, because they open the
reader from the detail page.

---

## 6. Confidence and gaps

- **B1 and B4: high.** They were reproduced on the production web build at both widths with history captured
  at each step. B2, B3 and B5 were reproduced at 1440 only. The Electron renderer runs the same `getRouter()` with the
  default browser history over `app://`, so the same stack behaviour is expected on desktop. That is
  inferred, not run.
- **B6–B11: from code only.** The chapter fixture has no distinct next chapter, and scroll restoration,
  merge and Discover sections were not driven.
- **Not run:** the Electron dev or packaged app, and Windows. Specific to Windows/desktop and unverified:
  - whether a mouse back button or Alt+← does anything in Electron 44 without an `app-command` handler. If
    it navigates, it follows the same broken stack; if it does nothing, the user was using the in-app Back;
  - whether `app://` reloads keep `history.state` (`__TSR_index`) as Chromium does for http.
  - The report's wording "reopens the manga" is read here as "reopens the title's reader (or detail page)".
    Both readings are explained by the same push. Either way, the user never gets back to the list.
- **Build used:** the existing `apps/web/.output` (built 13:56), not rebuilt. The navigation code involved
  last changed on Nov 6 (`9d0e272c`), and the `packages/*/dist` reader build is from 15:11. The navigation
  code is the same as on `0c96b79e`.
- **Shared worktree:** other agents' untracked files and edits (`tla/`, `apps/web/e2e-production/_card-*`,
  `zz-audit04*`, `packages/design-system/...`) were left untouched. My temporary spec and config were
  deleted. A web server on :5290 and a headless Chromium from another session were running at the end of
  this audit and are not mine. Nothing of mine is listening (:5291 is free).
