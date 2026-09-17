CREATE TABLE `etf_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`etf_id` integer NOT NULL,
	`security_id` integer NOT NULL,
	`weight` real NOT NULL,
	FOREIGN KEY (`etf_id`) REFERENCES `etfs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etf_holdings_etf_security`
ON `etf_holdings` (`etf_id`,`security_id`);
--> statement-breakpoint
CREATE INDEX `idx_etf_holdings_security_id`
ON `etf_holdings` (`security_id`);
--> statement-breakpoint
CREATE TABLE `etfs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`product_id` text,
	`slug` text,
	`source_url` text,
	`holdings_as_of` text NOT NULL,
	`last_synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etfs_ticker` ON `etfs` (`ticker`);--> statement-breakpoint
CREATE TABLE `sectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sectors_name` ON `sectors` (`name`);--> statement-breakpoint
CREATE TABLE `securities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identity_key` text NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`isin` text,
	`country` text,
	`industry` text,
	`sector_id` integer,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_securities_identity_key`
ON `securities` (`identity_key`);
--> statement-breakpoint
CREATE INDEX `idx_securities_ticker` ON `securities` (`ticker`);--> statement-breakpoint
CREATE INDEX `idx_securities_sector_id` ON `securities` (`sector_id`);
--> statement-breakpoint
PRAGMA optimize;
