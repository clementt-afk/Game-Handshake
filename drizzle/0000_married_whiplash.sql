CREATE TABLE `claims` (
	`room_code` text NOT NULL,
	`stage` integer NOT NULL,
	`bucket` integer NOT NULL,
	`item` integer NOT NULL,
	`token` text NOT NULL,
	PRIMARY KEY(`room_code`, `stage`, `bucket`, `item`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`token` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`room_code` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`stage` integer DEFAULT 0 NOT NULL,
	`dna` integer DEFAULT 0 NOT NULL,
	`wood` integer DEFAULT 0 NOT NULL,
	`stone` integer DEFAULT 0 NOT NULL,
	`challenge` integer DEFAULT 0 NOT NULL,
	`x` real DEFAULT 90 NOT NULL,
	`y` real DEFAULT 300 NOT NULL,
	`mutations` text DEFAULT '' NOT NULL,
	`shield` integer DEFAULT 0 NOT NULL,
	`stunned_until` integer DEFAULT 0 NOT NULL,
	`last_hit` integer DEFAULT 0 NOT NULL,
	`last_tick` integer DEFAULT 0 NOT NULL,
	`evolved_at` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_public_id_unique` ON `players` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_players_room` ON `players` (`room_code`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_token` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ends_at` integer,
	`winner_token` text
);
