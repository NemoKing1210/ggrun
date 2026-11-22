DROP TABLE "player_effects" CASCADE;--> statement-breakpoint
DROP TABLE "player_inventory" CASCADE;--> statement-breakpoint
DROP TYPE "public"."iee_effect_state";--> statement-breakpoint
DROP TYPE "public"."iee_item_state";--> statement-breakpoint
CREATE TYPE "public"."iee_duration_unit" AS ENUM('rolls', 'moves', 'passed_games', 'triggers', 'next_game', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."iee_end_reason" AS ENUM('used', 'expired', 'triggered', 'cleansed', 'removed', 'stolen', 'transferred', 'discarded', 'burned', 'replaced', 'revoked', 'reset');--> statement-breakpoint
CREATE TYPE "public"."iee_holder_kind" AS ENUM('player', 'cell', 'roll');--> statement-breakpoint
CREATE TYPE "public"."iee_instance_kind" AS ENUM('item', 'effect', 'board_object', 'roll_condition');--> statement-breakpoint
CREATE TYPE "public"."iee_instance_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."iee_visibility" AS ENUM('public', 'holder', 'staff');--> statement-breakpoint
CREATE TABLE "iee_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"kind" "iee_instance_kind" NOT NULL,
	"holder_kind" "iee_holder_kind" NOT NULL,
	"holder_player_id" uuid,
	"holder_cell_index" integer,
	"holder_roll_id" uuid,
	"owner_player_id" uuid,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"charges_left" integer,
	"remaining" integer,
	"remaining_unit" "iee_duration_unit",
	"anchor_roll_seq" integer,
	"status" "iee_instance_status" DEFAULT 'active' NOT NULL,
	"end_reason" "iee_end_reason",
	"source" text NOT NULL,
	"source_move_id" uuid,
	"cause_journal_id" bigint,
	"granted_roll_seq" integer DEFAULT 0 NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "iee_instances_one_holder" CHECK (("iee_instances"."holder_kind" = 'player' and "iee_instances"."holder_player_id" is not null and "iee_instances"."holder_cell_index" is null and "iee_instances"."holder_roll_id" is null)
        or ("iee_instances"."holder_kind" = 'cell' and "iee_instances"."holder_cell_index" is not null and "iee_instances"."holder_player_id" is null and "iee_instances"."holder_roll_id" is null)
        or ("iee_instances"."holder_kind" = 'roll' and "iee_instances"."holder_roll_id" is not null and "iee_instances"."holder_player_id" is null and "iee_instances"."holder_cell_index" is null)),
	CONSTRAINT "iee_instances_ended_has_reason" CHECK (("iee_instances"."status" = 'active' and "iee_instances"."end_reason" is null) or ("iee_instances"."status" = 'ended' and "iee_instances"."end_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "iee_journal" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"turn_seq" integer,
	"op" text NOT NULL,
	"actor_player_id" uuid,
	"target_player_id" uuid,
	"actor_user_id" uuid,
	"instance_id" uuid,
	"revision_id" uuid,
	"rule_index" integer,
	"intent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rng" jsonb,
	"cause_id" bigint,
	"visibility" "iee_visibility" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_holder_player_id_season_players_id_fk" FOREIGN KEY ("holder_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_holder_roll_id_game_rolls_id_fk" FOREIGN KEY ("holder_roll_id") REFERENCES "public"."game_rolls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_owner_player_id_season_players_id_fk" FOREIGN KEY ("owner_player_id") REFERENCES "public"."season_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_source_move_id_moves_id_fk" FOREIGN KEY ("source_move_id") REFERENCES "public"."moves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_instances" ADD CONSTRAINT "iee_instances_cause_journal_id_iee_journal_id_fk" FOREIGN KEY ("cause_journal_id") REFERENCES "public"."iee_journal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_journal" ADD CONSTRAINT "iee_journal_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_journal" ADD CONSTRAINT "iee_journal_actor_player_id_season_players_id_fk" FOREIGN KEY ("actor_player_id") REFERENCES "public"."season_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_journal" ADD CONSTRAINT "iee_journal_target_player_id_season_players_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."season_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_journal" ADD CONSTRAINT "iee_journal_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_journal" ADD CONSTRAINT "iee_journal_cause_id_iee_journal_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."iee_journal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "iee_instances_holder_idx" ON "iee_instances" USING btree ("season_id","holder_player_id","status");--> statement-breakpoint
CREATE INDEX "iee_instances_entry_idx" ON "iee_instances" USING btree ("season_id","entry_id","status");--> statement-breakpoint
CREATE INDEX "iee_instances_cell_idx" ON "iee_instances" USING btree ("season_id","holder_cell_index") WHERE "iee_instances"."status" = 'active';--> statement-breakpoint
CREATE INDEX "iee_journal_season_id_idx" ON "iee_journal" USING btree ("season_id","id");--> statement-breakpoint
CREATE INDEX "iee_journal_season_turn_idx" ON "iee_journal" USING btree ("season_id","turn_seq");