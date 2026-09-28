CREATE TABLE `enemies` (
	`room_code` text NOT NULL,
	`stage` integer NOT NULL,
	`enemy` integer NOT NULL,
	`hp` integer NOT NULL,
	`respawn_until` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room_code`, `stage`, `enemy`)
);
--> statement-breakpoint
CREATE TABLE `enemy_hits` (
	`room_code` text NOT NULL,
	`stage` integer NOT NULL,
	`enemy` integer NOT NULL,
	`token` text NOT NULL,
	`hit_at` integer NOT NULL,
	PRIMARY KEY(`room_code`, `stage`, `enemy`, `token`)
);
--> statement-breakpoint
CREATE TABLE `traps` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`stage` integer NOT NULL,
	`owner_token` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `players` ADD `last_attack` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `last_trap` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `last_gift` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `slowed_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `immune_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `protected_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `boss_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `era_boss_score` integer DEFAULT 0 NOT NULL;