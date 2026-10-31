# App overhaul - plan

Decisions and behavior are in `spec.md`. Each wave starts after the previous one lands.

| Wave | Work                                                                                                                                  | Shape                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1    | Telemetry log; status pages, Sonner and query middleware; proxy and live smoke test; responsive fixes; lint baseline and reducer hook | Parallel, one PR per slice      |
| 2    | Deslop and package consolidation (D9, D10)                                                                                            | One owner; touches all imports  |
| 3    | Provider gateway on Effect 4 (D8), migrating state and error violations module by module                                              | Parallel by module              |
| 4    | Offline runtime: drop SSR (D3), service worker and manifest, OPFS (D4), chapter downloads                                             | Stacked; ADR first              |
| 5    | Reader engine (D5): decode-ahead, virtualized strip, gestures outside React state, webtoon detection                                  | One owner, then parallel polish |
| 6    | Design reset (D6, D11): concept screens approved, `DESIGN.md` rewritten, registry, then screens                                       | Parallel by surface             |

## Wave 1 slices

| Slice            | Branch                       | Depends on | Acceptance summary                                                                |
| ---------------- | ---------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `telemetry-log`  | `feat/telemetry-log`         | -          | Bounded, redacted, local event log; viewable and exportable in Diagnostics        |
| `feedback-layer` | `feat/feedback-layer`        | telemetry  | `AppError`, Sonner wrapper, status pages, query middleware, undefined-query fixes |
| `provider-proxy` | `feat/provider-proxy`        | -          | Allowlisted API and image proxy; direct transport kept; scheduled live smoke test |
| `responsive-fix` | `fix/responsive-audit`       | -          | 320px overflow gone, 44px touch targets, detail layout, virtualized chapter list  |
| `lint-baseline`  | `chore/state-error-baseline` | -          | Reducer hook; `useState` and `try/catch` frozen at a shrinking baseline           |

Live proof for each slice runs against the production build on a `localhost` origin, not only mocks.
