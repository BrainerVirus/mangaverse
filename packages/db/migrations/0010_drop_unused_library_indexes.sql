-- #281: these four indexes never served a plan. The library page sorts after a join and
-- NULL-first expression, so SQLite always chooses a temp B-tree; the unread shelf filters
-- by a live chapter EXISTS rather than the stored count. Keep only the two that a
-- structured filter searches (`favorite`,`status`). Fresh databases still run 0008, so
-- this migration removes them there too.
DROP INDEX IF EXISTS `library_entries_added_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `library_entries_updated_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `library_entries_progress_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `library_entries_unread_idx`;
