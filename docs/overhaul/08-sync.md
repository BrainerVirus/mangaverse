# 8. Sync - spec

## Problem

Each device holds its own library, so moving between desktop and phone means losing your place. The owner
wants light metadata and shareable settings synced, without page images.

## Decisions

| #   | Decision                                                                                              | Why                                                             |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| S1  | Local stays the source of truth. Sync is an optional background copy on Supabase.                     | The app never waits on or depends on sync.                      |
| S2  | Electron works with no account. Signing in is only for sync.                                          | Keeps D2.                                                       |
| S3  | Accounts are invite-only. Public sign-up is off.                                                      | Private group, and it protects the free tier.                   |
| S4  | Row-level security on every table: a user can read, write and delete only their own rows.             | The anon key is public by design, so this is the real boundary. |
| S5  | A local outbox is written in the same transaction as each change, and removed only once acknowledged. | Works offline, survives restarts, and never loses an edit.      |
| S6  | Merging is per record, ordered by a hybrid logical clock, with device ID breaking ties.               | Device clock skew cannot decide wrongly, and all devices agree. |
| S7  | Reading progress reuses the existing progress ordering rules.                                         | Those rules are already tested against losing progress.         |
| S8  | Secrets, tokens and page files never sync.                                                            | Lowers risk, and pages are excluded by D4.                      |
| S9  | Show users what syncs and that the owner's project can read it. Offer delete-my-sync-data.            | Reading history is personal.                                    |
| S10 | Records sync by stable keys built from provider IDs, not local row IDs.                               | Local IDs differ between devices.                               |

### Table coverage

Every table has one classification. A new table must add itself here.

| Classification   | Tables                                                                                                                                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync             | `manga_identities`, `manga_provider_mappings`, `manga_titles`, `categories`, `library_entries`, `library_category_memberships`, `chapter_read_state`, `reader_preferences`, `theme_preferences`, `themes`, `saved_searches`, `extension_registries`, `installed_extensions`, `tracking_links` (no credentials) |
| Sync, per field  | `app_settings`, `provider_settings`: each key is marked shareable or device-only in its schema, and unmarked keys stay on the device                                                                                                                                                                           |
| Rebuilt locally  | `manga_people`, `manga_tags`, `manga_tag_memberships`, `chapters`, `chapter_pages`: refetched from the provider                                                                                                                                                                                                |
| Device-only      | `cache_entries`, `reading_history`, `search_history`, `migration_jobs`, `migration_history`, `extension_logs`                                                                                                                                                                                                  |
| Sync bookkeeping | `sync_state`: holds cursors, device ID and clock; extended by this work and never itself synced                                                                                                                                                                                                                |

Cover image bytes, downloads and file paths stay on the device. Reading history is device-only in the first
release, because progress covers the need and history grows quickly.

### Identity and references

- Manga: provider ID plus provider manga ID, through its mapping.
- Chapter state: mapping key plus provider chapter ID, so it can arrive before chapter rows exist and
  attach once they are fetched.
- Order on the server: identities, mappings, then dependents. A device holds a dependent until its parent arrives.
- Identity merges and splits sync as changes to mapping assignment, ordered like any other record.
- A provider synced to the website but not approved there shows as unavailable, and its metadata remains.

### Lifecycle

- **First sign-in:** union local data with the account after showing what will upload.
- **Other account on the same device:** never merge silently. Sync state is per account, and the user chooses to
  keep local data unsynced, upload it, or remove it.
- **Tombstones:** kept 180 days. A device offline longer does a full comparison and applies server deletions
  older than its cursor, so deleted records cannot come back.
- **Delete-my-sync-data:** deletes the server rows, clears this device's outbox, and increments an account
  generation. Devices seeing a newer generation stop syncing and ask, so a pending outbox cannot restore data.
- **Logging out:** local data stays and the outbox is held per account. A separate action removes local data.

### Free-tier limits

Supabase free gives 500 MB, and projects pause after a week of inactivity. A paused project delays sync but
never affects local use. Chapter read state is the largest table, so measure bytes per user early and store
it compactly if needed.

## Behavior

- Given a user never signs in, When they use the app, Then no sync request is made and nothing is reduced.
- Given a title added on desktop, When the phone syncs, Then the title appears with progress and no page images.
- Given chapter state arriving before its chapter, When chapters are fetched, Then the state attaches and shows.
- Given changes made offline, When the network returns, Then they sync without user action.
- Given the app dies after a change, When it reopens, Then the outbox still sends that change.
- Given the same record changed on two devices with skewed clocks, When they sync, Then both converge on the same value.
- Given a title removed on one device, When another syncs, Then it is removed there and does not come back.
- Given a device offline longer than tombstone retention, When it returns, Then deleted records stay deleted.
- Given reading progress on two devices, When they sync, Then the existing ordering rules choose and no newer progress is lost.
- Given a device-only or unmarked setting, When syncing, Then it is neither sent nor overwritten.
- Given user A's token, When it reads, writes or deletes user B's rows, Then all are refused; tests cover every synced table.
- Given Supabase is paused or down, When the app runs, Then local use is unaffected and sync waits quietly.
- Given an uninvited sign-up, When attempted, Then it is refused.
- Given a first sign-in with local data, When it starts, Then the user sees what will upload before anything is sent.
- Given a second account on a device, When it signs in, Then the first account's data is not uploaded without a choice.
- Given logging out, When finished, Then local data stays, with a separate action to remove it from the device.
- Given delete-my-sync-data with a pending outbox elsewhere, When that device returns, Then it stops and asks, and the data is not restored.
- Given a synced row with an older schema, When a device reads it, Then it migrates or is held without data loss.

## Out of scope

Syncing page images, reading history in the first release, shared libraries between users, end-to-end
encryption in the first release, and real-time collaboration.
