CREATE TYPE "public"."iee_effect_state" AS ENUM('active', 'expired', 'cleansed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."iee_event_status" AS ENUM('assigned', 'submitted', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."iee_item_state" AS ENUM('held', 'used', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "event_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description_md" text NOT NULL,
	"reward" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_proof" boolean DEFAULT true NOT NULL,
	"default_deadline_hours" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "player_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"season_player_id" uuid NOT NULL,
	"effect_key" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"polarity" text DEFAULT 'negative' NOT NULL,
	"charges_left" integer,
	"expires_after_roll_seq" integer,
	"state" "iee_effect_state" DEFAULT 'active' NOT NULL,
	"applied_by_season_player_id" uuid,
	"source" text DEFAULT 'cell_penalty' NOT NULL,
	"season_roll_seq" integer DEFAULT 0 NOT NULL,
	"source_move_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"season_player_id" uuid NOT NULL,
	"event_template_id" uuid,
	"event_key" text NOT NULL,
	"title" text NOT NULL,
	"description_md" text NOT NULL,
	"reward" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_proof" boolean DEFAULT true NOT NULL,
	"status" "iee_event_status" DEFAULT 'assigned' NOT NULL,
	"proof" text,
	"admin_note" text,
	"source" text DEFAULT 'cell_event' NOT NULL,
	"source_move_id" uuid,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	CONSTRAINT "player_events_sp_template_uq" UNIQUE("season_player_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "player_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"season_player_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"charges_left" integer DEFAULT 1 NOT NULL,
	"state" "iee_item_state" DEFAULT 'held' NOT NULL,
	"source" text DEFAULT 'cell_bonus' NOT NULL,
	"season_roll_seq" integer DEFAULT 0 NOT NULL,
	"source_move_id" uuid,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "season_players" ADD COLUMN "roll_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_effects" ADD CONSTRAINT "player_effects_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_effects" ADD CONSTRAINT "player_effects_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_effects" ADD CONSTRAINT "player_effects_applied_by_season_player_id_season_players_id_fk" FOREIGN KEY ("applied_by_season_player_id") REFERENCES "public"."season_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_effects" ADD CONSTRAINT "player_effects_source_move_id_moves_id_fk" FOREIGN KEY ("source_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_event_template_id_event_templates_id_fk" FOREIGN KEY ("event_template_id") REFERENCES "public"."event_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_source_move_id_moves_id_fk" FOREIGN KEY ("source_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_source_move_id_moves_id_fk" FOREIGN KEY ("source_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_effects_sp_state_idx" ON "player_effects" USING btree ("season_player_id","state");--> statement-breakpoint
CREATE INDEX "player_effects_season_key_idx" ON "player_effects" USING btree ("season_id","effect_key");--> statement-breakpoint
CREATE INDEX "player_events_sp_status_idx" ON "player_events" USING btree ("season_player_id","status");--> statement-breakpoint
CREATE INDEX "player_events_season_status_idx" ON "player_events" USING btree ("season_id","status");--> statement-breakpoint
CREATE INDEX "player_inventory_sp_state_idx" ON "player_inventory" USING btree ("season_player_id","state");--> statement-breakpoint
CREATE INDEX "player_inventory_season_key_idx" ON "player_inventory" USING btree ("season_id","item_key");--> statement-breakpoint
CREATE INDEX "moves_season_player_idx" ON "moves" USING btree ("season_player_id");