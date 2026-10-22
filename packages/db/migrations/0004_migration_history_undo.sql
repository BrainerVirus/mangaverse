ALTER TABLE `migration_history` ADD `batch_id` text;--> statement-breakpoint
ALTER TABLE `migration_history` ADD `previous_default_mapping_id` text;--> statement-breakpoint
ALTER TABLE `migration_history` ADD `previous_active_mapping_id` text;--> statement-breakpoint
CREATE INDEX `migration_history_batch_idx` ON `migration_history` (`batch_id`);
