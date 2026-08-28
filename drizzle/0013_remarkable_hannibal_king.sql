ALTER TABLE "games_catalog" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "playtime_hours" integer;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "stores" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games_catalog" ADD COLUMN "website" text;