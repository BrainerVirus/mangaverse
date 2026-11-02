CREATE INDEX `library_entries_favorite_added_idx` ON `library_entries` (`favorite`,`added_at`);--> statement-breakpoint
CREATE INDEX `library_entries_status_added_idx` ON `library_entries` (`status`,`added_at`);--> statement-breakpoint
CREATE INDEX `library_entries_added_idx` ON `library_entries` (`added_at`);--> statement-breakpoint
CREATE INDEX `library_entries_updated_idx` ON `library_entries` (`updated_at`);--> statement-breakpoint
CREATE INDEX `library_entries_progress_idx` ON `library_entries` (`progress_percent`);--> statement-breakpoint
CREATE INDEX `library_entries_unread_idx` ON `library_entries` (`unread_count`);--> statement-breakpoint
CREATE INDEX `chapter_read_state_manga_updated_idx` ON `chapter_read_state` (`manga_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `chapters_manga_mapping_idx` ON `chapters` (`manga_id`,`provider_mapping_id`);--> statement-breakpoint
CREATE INDEX `manga_provider_mappings_provider_manga_idx` ON `manga_provider_mappings` (`provider_id`,`manga_id`);--> statement-breakpoint
CREATE INDEX `manga_identities_canonical_title_idx` ON `manga_identities` (`canonical_title`);
