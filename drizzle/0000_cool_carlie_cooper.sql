CREATE TABLE `lexicon_cache` (
	`word` text PRIMARY KEY NOT NULL,
	`ipa` text NOT NULL,
	`meaning` text NOT NULL,
	`source` text DEFAULT 'dictionary' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `practice_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`word` text NOT NULL,
	`spelling_correct` integer NOT NULL,
	`reading_correct` integer NOT NULL,
	`response_ms` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_user_created` ON `practice_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `word_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`word` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`spelling_errors` integer DEFAULT 0 NOT NULL,
	`reading_errors` integer DEFAULT 0 NOT NULL,
	`mastery` integer DEFAULT 0 NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`due_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_word_progress_user_word` ON `word_progress` (`user_id`,`word`);--> statement-breakpoint
CREATE INDEX `idx_word_progress_user_due` ON `word_progress` (`user_id`,`due_at`);