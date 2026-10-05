CREATE TYPE "public"."file_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"owner_id" uuid,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"width" integer,
	"height" integer,
	"visibility" "file_visibility" DEFAULT 'public' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bot_runs" ALTER COLUMN "config" SET DEFAULT '{"botCount":3,"actionsPerTick":2,"tickIntervalMs":2000,"passWeight":70,"dropWeight":20,"rerollWeight":10,"enableRoll":true,"enableResolve":true,"enableItems":true,"itemChance":60,"autoCleanse":true,"targetStrategy":"leader","stopOnError":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_key_uq" ON "files" USING btree ("key");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "files_category_idx" ON "files" USING btree ("category");--> statement-breakpoint
CREATE INDEX "files_created_idx" ON "files" USING btree ("created_at");