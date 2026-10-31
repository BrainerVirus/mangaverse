# 1. Engineering rules - spec

## Problem

`useState` and `try/catch` each appear well over 100 times, and 31 catch blocks plus 12 no-op `.catch`
calls may swallow errors. Duplicate helpers exist (`errorMessage` four times, `isPlainObject` three
times). 12 of 21 packages have one consumer. `test-utils` is unused, and `backup` mostly wraps `db`.
Docs overlap across `DESIGN.md`, `docs/Design.md`, `SPEC`, `PLAN` and the recovery ledger.

## Decisions

| #   | Decision                                                                                                                                                                | Why                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| E1  | Lint bans `useState` and `try/catch`. Existing uses are frozen per file in a baseline that only shrinks.                                                                | Stops new violations before old ones are migrated. |
| E2  | Local state uses a typed `useStateReducer` hook; remote state TanStack Query; shared state Zustand.                                                                     | One answer for each kind of state.                 |
| E3  | Effect 4 for the provider runtime, update queue, cache and database lifecycle.                                                                                          | These need retries, cancellation and typed errors. |
| E4  | No Effect in gestures, rendering, design system, motion or theme.                                                                                                       | It adds cost there with no benefit.                |
| E5  | Migrate module by module as each spec touches that code. No repo-wide rewrite.                                                                                          | Keeps PRs reviewable and ties work to user value.  |
| E6  | Keep `shared`, `db`, `design-system` with `motion`, `theme`, `platform`, `reader`, `extensions-sdk`, `extensions` with core and MangaDex. Others move into the web app. | Removes seams nothing varies across.               |
| E7  | Theme editor, identity merge, diagnostics and bulk migration move under "Advanced". Data is untouched.                                                                  | Simplifies first use.                              |
| E8  | Deslop: remove dead code, duplicates, wrapper tests and archived docs that no longer guide work.                                                                        | Less for people and agents to read and maintain.   |

Consolidation touches every import, so it has one owner and runs alone.

## Behavior

- Given a new `useState` in a non-test file, When the check runs, Then it fails naming the file and line.
- Given a new `try/catch` in a non-test file, When the check runs, Then it fails naming the file and line.
- Given a file drops below its baseline, When the check runs, Then it fails until the baseline is lowered.
- Given an unchanged tree, When the check runs, Then it passes.
- Given `useStateReducer`, When events dispatch, Then state follows the reducer with inferred types and no stale closures.
- Given consolidation is done, When the full suite and production E2E run, Then behavior is unchanged.
- Given an Advanced feature, When its old URL opens, Then it still works and existing data is intact.

## Out of scope

Migrating every violation in one pass, and rewriting tests that still catch real breaks. A test is
deleted only after naming the break it catches and proving a test at the new interface fails on it.
