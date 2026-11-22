CREATE TYPE "public"."iee_character" AS ENUM('bonus', 'penalty');--> statement-breakpoint
CREATE TYPE "public"."iee_entry_kind" AS ENUM('item', 'effect');--> statement-breakpoint
CREATE TYPE "public"."iee_pack_visibility" AS ENUM('draft', 'library');--> statement-breakpoint
CREATE TYPE "public"."iee_rarity" AS ENUM('common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TABLE "iee_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"kind" "iee_entry_kind" NOT NULL,
	"draft" jsonb NOT NULL,
	"icon_file_id" uuid,
	"latest_revision_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "iee_entries_pack_slug_uq" UNIQUE("pack_id","slug"),
	CONSTRAINT "iee_entries_slug_format" CHECK ("iee_entries"."slug" ~ '^[a-z0-9_]{2,48}$')
);
--> statement-breakpoint
CREATE TABLE "iee_entry_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"doc" jsonb NOT NULL,
	"dsl_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iee_entry_revisions_number_uq" UNIQUE("entry_id","number"),
	CONSTRAINT "iee_entry_revisions_hash_uq" UNIQUE("entry_id","content_hash"),
	CONSTRAINT "iee_entry_revisions_number_positive" CHECK ("iee_entry_revisions"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "iee_pack_dependencies" (
	"pack_id" uuid NOT NULL,
	"depends_on_pack_id" uuid NOT NULL,
	CONSTRAINT "iee_pack_dependencies_pack_id_depends_on_pack_id_pk" PRIMARY KEY("pack_id","depends_on_pack_id")
);
--> statement-breakpoint
CREATE TABLE "iee_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"names" jsonb NOT NULL,
	"description" jsonb,
	"icon_file_id" uuid,
	"visibility" "iee_pack_visibility" DEFAULT 'draft' NOT NULL,
	"default_locale" text DEFAULT 'ru' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_dsl_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "iee_packs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "iee_packs_slug_format" CHECK ("iee_packs"."slug" ~ '^[a-z0-9_]{2,48}$'),
	CONSTRAINT "iee_packs_default_locale" CHECK ("iee_packs"."default_locale" in ('ru', 'en', 'uk'))
);
--> statement-breakpoint
CREATE TABLE "season_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"pool" "iee_character" NOT NULL,
	"rarity" "iee_rarity",
	"weight" integer NOT NULL,
	"max_per_season" integer,
	"max_per_player" integer,
	"cooldown_rolls" integer DEFAULT 0 NOT NULL,
	"min_position" integer DEFAULT 0 NOT NULL,
	"unlock_after_move" integer DEFAULT 0 NOT NULL,
	"param_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_override" integer,
	"target_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_catalog_season_entry_uq" UNIQUE("season_id","entry_id"),
	CONSTRAINT "season_catalog_weight_nonnegative" CHECK ("season_catalog"."weight" >= 0),
	CONSTRAINT "season_catalog_target_override" CHECK ("season_catalog"."target_override" is null or "season_catalog"."target_override" in ('self', 'other', 'any', 'none'))
);
--> statement-breakpoint
ALTER TABLE "iee_entries" ADD CONSTRAINT "iee_entries_pack_id_iee_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."iee_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_entries" ADD CONSTRAINT "iee_entries_icon_file_id_files_id_fk" FOREIGN KEY ("icon_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_entries" ADD CONSTRAINT "iee_entries_latest_revision_id_iee_entry_revisions_id_fk" FOREIGN KEY ("latest_revision_id") REFERENCES "public"."iee_entry_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_entries" ADD CONSTRAINT "iee_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_entry_revisions" ADD CONSTRAINT "iee_entry_revisions_entry_id_iee_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."iee_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_entry_revisions" ADD CONSTRAINT "iee_entry_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_pack_dependencies" ADD CONSTRAINT "iee_pack_dependencies_pack_id_iee_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."iee_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_pack_dependencies" ADD CONSTRAINT "iee_pack_dependencies_depends_on_pack_id_iee_packs_id_fk" FOREIGN KEY ("depends_on_pack_id") REFERENCES "public"."iee_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_packs" ADD CONSTRAINT "iee_packs_icon_file_id_files_id_fk" FOREIGN KEY ("icon_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_packs" ADD CONSTRAINT "iee_packs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_catalog" ADD CONSTRAINT "season_catalog_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_catalog" ADD CONSTRAINT "season_catalog_entry_id_iee_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."iee_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_catalog" ADD CONSTRAINT "season_catalog_revision_id_iee_entry_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."iee_entry_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_catalog_revision_idx" ON "season_catalog" USING btree ("revision_id");--> statement-breakpoint
-- Instances granted before the library existed point at revisions no table
-- holds yet, and the foreign keys below would refuse them. No data migration
-- (spec §4): only a database that ran the stage-1 code has any.
DELETE FROM "iee_instances";--> statement-breakpoint
-- The season catalog replaces the entries map (spec §4.5).
UPDATE "seasons" SET "config" = "config" #- '{iee,entries}' WHERE jsonb_typeof("config"->'iee') = 'object';--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_entry_id_iee_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."iee_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_revision_id_iee_entry_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."iee_entry_revisions"("id") ON DELETE restrict ON UPDATE no action;