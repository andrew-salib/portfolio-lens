CREATE TABLE `performance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`etf_id` integer NOT NULL,
	`one_year` real,
	`three_year_pa` real,
	`five_year_pa` real,
	`ten_year_pa` real,
	`as_of` text NOT NULL,
	`fetched_at` text NOT NULL,
	`currency` text NOT NULL,
	`source_url` text NOT NULL,
	`basis` text NOT NULL,
	FOREIGN KEY (`etf_id`) REFERENCES `etfs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `performance_etf_id_unique` ON `performance` (`etf_id`);