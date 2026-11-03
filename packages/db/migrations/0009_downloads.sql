CREATE TABLE `downloads` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`status` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`completed_pages` integer DEFAULT 0 NOT NULL,
	`failed_page_indexes_json` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `downloads_manga_idx` ON `downloads` (`manga_id`);--> statement-breakpoint
CREATE INDEX `downloads_status_idx` ON `downloads` (`status`);
