ALTER TABLE `cache_entries` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `cache_entries` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `cache_entries` ADD `byte_size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cache_entries` ADD `blob_key` text;--> statement-breakpoint
CREATE INDEX `cache_entries_kind_access_idx` ON `cache_entries` (`cache_kind`,`last_access_at`);
