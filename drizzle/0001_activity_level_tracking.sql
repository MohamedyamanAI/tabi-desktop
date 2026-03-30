CREATE TABLE `activity_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`keystrokes` integer DEFAULT 0 NOT NULL,
	`mouse_clicks` integer DEFAULT 0 NOT NULL,
	`time_entry_id` text,
	`synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `window_activities` ADD `time_entry_id` text;--> statement-breakpoint
ALTER TABLE `window_activities` ADD `synced` integer DEFAULT false NOT NULL;