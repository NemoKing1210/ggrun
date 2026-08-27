ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "accent" text DEFAULT 'amber' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text;