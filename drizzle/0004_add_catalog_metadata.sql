ALTER TABLE "games_catalog" ADD COLUMN "metacritic" integer;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "rating" numeric;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "esrb" text;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "external_raw_id" text;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;