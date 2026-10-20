-- Concurrent tabs could add the same manga twice; the UI pending guard is per-tab.
-- Keep one entry per manga before the unique index can be created.
-- Deterministic keeper: earliest added_at (NULL/empty sorts last), then id.
-- Duplicate category memberships are repointed to the keeper with INSERT OR IGNORE,
-- so deleting the duplicates (and their cascading memberships) loses no category.
WITH keepers AS (
	SELECT keeper.manga_id, keeper.id AS keeper_id
	FROM library_entries AS keeper
	WHERE keeper.id = (
		SELECT candidate.id
		FROM library_entries AS candidate
		WHERE candidate.manga_id = keeper.manga_id
		ORDER BY
			CASE WHEN candidate.added_at IS NULL OR candidate.added_at = '' THEN 1 ELSE 0 END,
			candidate.added_at,
			candidate.id
		LIMIT 1
	)
)
INSERT OR IGNORE INTO `library_category_memberships` (`library_entry_id`, `category_id`)
SELECT keepers.keeper_id, membership.category_id
FROM `library_category_memberships` AS membership
JOIN `library_entries` AS duplicate ON duplicate.id = membership.library_entry_id
JOIN keepers ON keepers.manga_id = duplicate.manga_id
WHERE duplicate.id <> keepers.keeper_id;--> statement-breakpoint
WITH keepers AS (
	SELECT keeper.manga_id, keeper.id AS keeper_id
	FROM library_entries AS keeper
	WHERE keeper.id = (
		SELECT candidate.id
		FROM library_entries AS candidate
		WHERE candidate.manga_id = keeper.manga_id
		ORDER BY
			CASE WHEN candidate.added_at IS NULL OR candidate.added_at = '' THEN 1 ELSE 0 END,
			candidate.added_at,
			candidate.id
		LIMIT 1
	)
)
DELETE FROM `library_entries`
WHERE id NOT IN (SELECT keeper_id FROM keepers);--> statement-breakpoint
DROP INDEX IF EXISTS `library_entries_manga_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `library_entries_manga_unique_idx` ON `library_entries` (`manga_id`);
