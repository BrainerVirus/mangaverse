CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `cache_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_id` text,
	`cache_kind` text NOT NULL,
	`last_access_at` text NOT NULL,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX `cache_entries_provider_manga_chapter_access_idx` ON `cache_entries` (`provider_id`,`manga_id`,`chapter_id`,`last_access_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`sort_index` integer,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `chapter_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`page_index` integer NOT NULL,
	`image_url` text NOT NULL,
	`width` integer,
	`height` integer,
	`bytes` integer,
	`mime_type` text,
	`load_failed` integer,
	`retry_count` integer,
	`last_error_code` text,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chapter_pages_chapter_idx` ON `chapter_pages` (`chapter_id`);--> statement-breakpoint
CREATE TABLE `chapter_read_state` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`provider_mapping_id` text,
	`read_percent` real NOT NULL,
	`last_page_index` integer NOT NULL,
	`completed` integer NOT NULL,
	`started_at` text,
	`updated_at` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chapter_read_state_manga_chapter_idx` ON `chapter_read_state` (`manga_id`,`chapter_id`);--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`provider_mapping_id` text NOT NULL,
	`provider_id` text,
	`provider_chapter_id` text,
	`title` text NOT NULL,
	`chapter_index` integer NOT NULL,
	`volume` text,
	`published_at` text,
	`created_at` text,
	`updated_at` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`provider_mapping_id`) REFERENCES `manga_provider_mappings`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_mapping_index_uidx` ON `chapters` (`provider_mapping_id`,`chapter_index`);--> statement-breakpoint
CREATE INDEX `chapters_manga_idx` ON `chapters` (`manga_id`);--> statement-breakpoint
CREATE TABLE `extension_registries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`registry_url` text NOT NULL,
	`description` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `installed_extensions` (
	`id` text PRIMARY KEY NOT NULL,
	`manifest_json` text NOT NULL,
	`source_url` text NOT NULL,
	`registry_url` text,
	`checksum` text,
	`installed_version` text NOT NULL,
	`enabled` integer NOT NULL,
	`installed_at` text NOT NULL,
	`updated_at` text,
	`state` text NOT NULL,
	`health` text NOT NULL,
	`warnings_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_category_memberships` (
	`library_entry_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`library_entry_id`, `category_id`),
	FOREIGN KEY (`library_entry_id`) REFERENCES `library_entries`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_category_memberships_category_entry_idx` ON `library_category_memberships` (`category_id`,`library_entry_id`);--> statement-breakpoint
CREATE TABLE `library_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`last_read_chapter_id` text,
	`active_provider_mapping_id` text,
	`progress_percent` real,
	`notes` text,
	`added_at` text,
	`updated_at` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_entries_manga_idx` ON `library_entries` (`manga_id`);--> statement-breakpoint
CREATE TABLE `manga_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_title` text NOT NULL,
	`status` text NOT NULL,
	`content_rating` text NOT NULL,
	`language` text,
	`description` text,
	`cover_image_url` text,
	`merged` integer DEFAULT false NOT NULL,
	`merged_from_ids_json` text,
	`user_overrides_json` text,
	`default_provider_mapping_id` text NOT NULL,
	`preferred_chapter_source_id` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `manga_identities_default_mapping_idx` ON `manga_identities` (`default_provider_mapping_id`);--> statement-breakpoint
CREATE TABLE `manga_people` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`kind` text NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `manga_people_manga_idx` ON `manga_people` (`manga_id`);--> statement-breakpoint
CREATE TABLE `manga_provider_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_manga_id` text NOT NULL,
	`provider_title` text,
	`provider_url` text,
	`last_synced_at` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manga_provider_mappings_provider_remote_uidx` ON `manga_provider_mappings` (`provider_id`,`provider_manga_id`);--> statement-breakpoint
CREATE INDEX `manga_provider_mappings_manga_idx` ON `manga_provider_mappings` (`manga_id`);--> statement-breakpoint
CREATE TABLE `manga_tag_memberships` (
	`manga_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`manga_id`, `tag_id`),
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `manga_tags`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `manga_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`namespace` text
);
--> statement-breakpoint
CREATE TABLE `manga_titles` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`locale` text,
	`value` text NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `manga_titles_manga_idx` ON `manga_titles` (`manga_id`);--> statement-breakpoint
CREATE TABLE `migration_history` (
	`id` text PRIMARY KEY NOT NULL,
	`source_provider_id` text NOT NULL,
	`source_provider_manga_id` text NOT NULL,
	`target_provider_id` text NOT NULL,
	`target_provider_manga_id` text NOT NULL,
	`manga_id` text NOT NULL,
	`completed_at` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `migration_history_providers_idx` ON `migration_history` (`source_provider_id`,`source_provider_manga_id`,`target_provider_id`,`target_provider_manga_id`);--> statement-breakpoint
CREATE TABLE `migration_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`payload_json` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `provider_settings` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`label` text,
	`settings_json` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `reader_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`settings_json` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `reading_history` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`read_at` text NOT NULL,
	`provider_mapping_id` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_history_read_at_idx` ON `reading_history` (`read_at`);--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`filter_json` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `search_history` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`searched_at` text NOT NULL,
	`provider_id` text
);
--> statement-breakpoint
CREATE INDEX `search_history_query_time_idx` ON `search_history` (`query`,`searched_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `theme_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`dark` integer NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `tracking_links` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`service` text NOT NULL,
	`external_id` text NOT NULL,
	`external_url` text,
	`last_synced_at` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga_identities`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracking_links_manga_idx` ON `tracking_links` (`manga_id`);