# 8. Sync - spec

## Problem

Each device holds its own library, so moving between desktop and phone means losing your place. The owner
wants light metadata and shareable settings synced, without page images.

## Decisions

| #   | Decision                                                                                   | Why                                                             |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| S1  | Local stays the source of truth. Sync is an optional background copy on Supabase.          | The app never waits on or depends on sync.                      |
| S2  | Electron works with no account. Signing in is only for sync.                               | Keeps D2.                                                       |
| S3  | Accounts are invite-only. Public sign-up is off.                                           | Private group, and it protects the free tier.                   |
| S4  | Row-level security: each user can read and write only their own rows.                      | The anon key is public by design, so this is the real boundary. |
| S5  | A local outbox sends changes in the background, and retries survive restarts.              | Works offline and survives Supabase pauses.                     |
| S6  | Merging is per record: newest edit wins, with deletions kept as tombstones.                | Simple, predictable, and enough for one person's devices.       |
| S7  | Reading progress reuses the existing progress ordering rules.                              | Those rules are already tested against losing progress.         |
| S8  | Secrets, tokens and page files never sync.                                                 | Lowers risk, and pages are excluded by D4.                      |
| S9  | Show users what syncs and that the owner's project can read it. Offer delete-my-sync-data. | Reading history is personal.                                    |

### What syncs

| Syncs                                                               | Stays on the device                             |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| Library entries, status, favorites, categories                      | Page images, downloads, cached pages            |
| Manga metadata needed to show a title, and provider mappings        | Cover image bytes (refetched from the provider) |
| Reading progress and chapter read state                             | Storage limits, file paths, window state        |
| Installed provider references and enabled state                     | Secrets and provider credentials                |
| Reader settings, per-title overrides, theme, shareable app settings | Telemetry log                                   |

Each setting is marked shareable or device-only in its schema, so new settings must choose. A provider
synced to the website but not approved there shows as unavailable, and its metadata remains.

### Free-tier limits

Supabase free gives 500 MB, and projects pause after a week of inactivity. A paused project delays sync but
never affects local use. Chapter read state is the largest table, so measure bytes per user early and store
it compactly if needed.

## Behavior

- Given a user never signs in, When they use the app, Then no sync request is made and nothing is reduced.
- Given a title added on desktop, When the phone syncs, Then the title appears with progress and no page images.
- Given changes made offline, When the network returns, Then they sync without user action.
- Given the same record changed on two devices, When they sync, Then the newest edit wins on both.
- Given a title removed on one device, When another syncs, Then it is removed there and does not come back.
- Given reading progress on two devices, When they sync, Then the existing ordering rules choose and no newer progress is lost.
- Given a device-only setting, When syncing, Then it is neither sent nor overwritten.
- Given user A's token, When it requests user B's rows, Then none are returned; tests cover every synced table.
- Given Supabase is paused or down, When the app runs, Then local use is unaffected and sync waits quietly.
- Given an uninvited sign-up, When attempted, Then it is refused.
- Given logging out, When finished, Then local data stays, with a separate action to remove it from the device.
- Given delete-my-sync-data, When confirmed, Then the user's rows are removed and local data stays.
- Given a synced row with an older schema, When a device reads it, Then it migrates or is ignored without data loss.

## Out of scope

Syncing page images, shared libraries between users, end-to-end encryption in the first release, and real-time collaboration.
