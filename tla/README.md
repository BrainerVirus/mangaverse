# App-flow models (baseline `0c96b79e`)

These are **abstract, finite models**, not tests of the running app and not proof of a Windows-specific root cause. The `current` actions transcribe the baseline's relevant branches; a counterexample demonstrates a behavior of that abstraction. Validate it against the actual build and device before attributing a user report. `fixed` is a proposed change to the abstraction, not code that has been implemented. Other agents may change the worktree while these models are running; the line references below refer to baseline `0c96b79e`.

## Run

Java 21 was available (`openjdk 21.0.7`). TLC identifies the pinned jar as `TLC2 Version 2026.11.06.222357 (rev: d8fb231)`; it was obtained from the TLA+ **v1.8.0** GitHub release. From the repository root:

```sh
java -version
./tla/run-tlc.sh
# Or use an existing jar (no download/checksum applied to a supplied jar):
TLA2TOOLS_JAR=/path/to/tla2tools.jar ./tla/run-tlc.sh
```

The runner downloads the release jar to `${TMPDIR:-/tmp}/mangaverse-tla2tools-1.8.0.jar` if needed and verifies SHA-256 `e1f11b75c4b5bc4478ba0ac5cb6ae28e40a01b0016bc33e0aa97da22dfdbcd7f`; no jar or package dependency is stored in the repository. It writes full TLC output into `tla/traces/`, including intentionally failing counterexamples, and returns success only when each `current` model produces the expected safety violation (TLC exit 12, or 13 for the action property) and every `fixed` model passes. `TLC_WORKERS=1` can be used for more deterministic ordering. The runner disables deadlock checking because these are user-driven systems allowed to stop; it does **not** check liveness or fairness. Java, curl, and either `shasum` or `sha256sum` are required for the automatic download.

Run one configuration without changing saved traces:

```sh
cd tla
java -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -deadlock -noGenerateSpecTE \
  -config models/Navigation-current-NoBackIntoReader.cfg Navigation.tla
```

## Reading counterexamples

`State 1` is an initial state; each later `State` is reached by the named action. Aliases are views of the underlying variables, not extra state. For Navigation, `stack` is oldest to newest and `*` marks the current entry. A bound such as `HistoryBound` prunes paths outside the bound; a passing bounded search is not an unbounded proof. Current configs isolate invariants so TLC doesn't stop at a different, earlier failure. State counts for failing models are partial, depend on worker scheduling, and are not coverage measures.

The full traces and model configs are versioned here. The following counts were observed with four workers on Java 21:

| Model / bound | Current | Proposed fixed |
| --- | --- | --- |
| Navigation: 3 list origins, 2 manga, 2 chapters, history <= 6; fixed also tests deep links | Four isolated violations | 240,348 distinct states, all five invariants and the action property pass |
| ReaderSettings: 2 chapters, two page shapes, global Auto/RTL, 1 edit fixed / 2 edits current | Five isolated violations | 327,340 distinct states, five invariants pass; with modeled write failures, 389,472 pass |
| Discover: 2 providers, abstract section statuses | Two isolated violations | 123 distinct states, two invariants pass |
| Settings: one global edit and title reset | One violation | 5 distinct states pass |

## Counterexamples and mapping

### Navigation

- **Reader close/back loop**: `traces/Navigation-current-NoBackIntoReader.txt` shows a list → manga → reader → Close → manga → Back → reader sequence. Detail Back uses browser history (`apps/web/app/routes/manga.$id.tsx:327-333`, `apps/web/app/queries/manga-detail-route-helpers.ts:285-295`); reader close *pushes* detail (`apps/web/app/routes/reader.$chapterId.tsx:301-307`). `OriginBack` and `ClosedPageNotLeftBelow` expose related consequences. Proposed: return to the existing matching detail entry if appropriate, otherwise replace the reader entry; replace rather than push a fallback. Preserve origin explicitly and validate actual router behavior, including external/deep-link history.
- **Chapter history**: `ReaderBackExitsReader` shows chapter next/previous adds a reader entry (`reader.$chapterId.tsx:295-300`), so system Back reopens a prior chapter. The checked desired behavior is that Back exits the reading session; if product intends chapter-by-chapter history, this invariant and the proposed replacement are not requirements. Proposed model replaces chapter steps.
- Discover See All/back pushes search updates (`discover.tsx:222-231`); the model proposes back/replace for the return. Reload is modeled as a stutter, a fresh deep link as an initial state; external websites, arbitrary forward-stack histories and OS-specific events aren't modeled. The fixed result only checks this abstraction, not an implementation of origin tracking. Related-title origin is not asserted after a deep-link fallback.

### Reader settings

The query cache, saved rows, pending coalesced edit, scoped mutation queue, page-shape decision, UI panel and engine are separate. The model resolves just mode, layout and fit, plus abstract applicability of strip gap and spread offset. `SavedReflectsUI` tests quiescence, not optimistic UI while saving; `NoLostUpdate` excludes executions after a reported write failure. A value can be intentionally preserved for a different mode, so treating a contextually inactive option as ignored (`NoIgnoredOption`) is a **design requirement/assumption**, not itself proof of a defect. No physical panel coverage or pixel/hit-testing is modeled.

- **`NoLostUpdate`**: a global quick edit then Reset title within the 300 ms coalescing window cancels the pending write, so the global edit is lost. `reader.$chapterId.tsx:189-203,277-281`; `apps/web/app/lib/use-coalesced-settings-write.ts:26-51`. `Settings-current.txt` isolates the same sequence. Proposed: flush/serialize the global write before resetting title overrides, or split pending operations by scope. The model assumes both user actions can occur before the timer fires; reproduce with a deterministic test.
- **`SavedReflectsUI`**: edit in chapter 1, navigate to chapter 2 before the delayed write, then the old chapter write finishes. The new chapter can retain an old cached title layer: the write invalidates its own chapter key (`reader.$chapterId.tsx:149-185`), while the coalescer explicitly outlives unmount (`use-coalesced-settings-write.ts:13-17`). The shortest trace can use an explicit Auto override, changing layer identity but not the visible rendering; use an actual changed value in an integration repro. Proposed: rebase pending writes and invalidate/reconcile the active chapter after a title-wide write.
- **`PanelHonest`**: global RTL may be highlighted while a first decoded tall page selects vertical (`packages/reader/src/resolve-reader-settings.ts:78-95`, `packages/reader/src/measured-page-shape.ts:92-117`, `packages/reader/src/components/reader-settings-sheet.tsx:260-265`). Auto/page-shape precedence is intentional in R6; this invariant expresses a proposed distinction between saved preference and effective presentation. Show the effective mode and why it differs rather than implying the saved value is the current rendering.
- **`NoIgnoredOption`**: changing strip gap in paged mode doesn't affect the current page; gap is consumed by `packages/reader/src/components/ReaderScrollLayer.tsx:42-47`. It may reasonably configure a future mode; if so, label it as such rather than disable it. The model's fixed branch disables contextually inactive controls; that is a design proposal, not a prescribed fix. Fit settings in strip mode are also not passed into this scroll layer.
- **`KeepsPagedDirection`**: the saved trace exercises All titles + Auto-strip + layout selection: page-shape resolution continues to outrank the new global paged direction. See `reader-settings-change.ts:20-34,49-74`, `measured-page-shape.ts:92-117`, and `components/ReaderScreen.tsx:438-453`. The model's desired rule is last shown paged direction; its fixed branch adds a title override when necessary and stores a direction across chapter remounts. Both are product/design choices that can change scope semantics and require approval. A concrete title override already takes precedence in current code.

The fixed reader model assumes serialized/coalesced patch operations, rebasing in-flight reads and current chapter cache, and a persisted last paged direction. These are abstract candidate mechanisms, **not** implemented fixes. The passing fixed configurations allow only one edit; they cannot establish correctness of multiple concurrent edits or all reset/failure interleavings. The broader three-edit exploration exceeded the time budget. The model does not represent every settings field, global-vs-title concurrent writers, partial database transactions, real query cancellation, or DOM geometry.

### Discover

- **`SelectionMatchesUrl`**: select provider B, then browser Back to provider A. Local state is initialized from search only once (`apps/web/app/routes/discover.tsx:174-180`), while selection writes both state and search (`:217-220`); the rendered tab uses local selection (`features/search/components/DiscoverPage.tsx:177-183`). Proposed: derive selection from current search or synchronize it on history navigation, with a valid-provider fallback.
- **`FailureHasRecovery`**: app-settings query fails, blocking the feed query (`discover.tsx:182-195`), but page `isError` and retry omit that query (`:214-215,234-240`). Proposed: surface the settings-query error and retry it. The model treats successful retry as an available transition, not a liveness guarantee.

Discover pagination/partial/empty are abstract states, not a faithful model of provider responses, cancellation, offsets, or all partial errors. `queries/provider-discover.ts:152-190` filters rejected and empty sections; the model does not assert that those partial failures are visible. It cannot establish provider recoverability under perpetual network failure.

### Settings

`Settings.tla` is an intentionally small independent projection of the global-edit/title-reset race above, not a comprehensive model of manga actions or settings persistence. The fixed model queues the edit before reset. Manga target/action invariants, reload across app restarts, and OS persistence are **not checked**.
