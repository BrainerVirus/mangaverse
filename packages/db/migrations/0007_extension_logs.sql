CREATE TABLE `extension_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`level` text NOT NULL,
	`code` text NOT NULL,
	`message` text NOT NULL,
	`details_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `extension_logs_provider_created_idx` ON `extension_logs` (`provider_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `extension_logs_level_created_idx` ON `extension_logs` (`level`,`created_at`);
