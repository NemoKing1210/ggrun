CREATE TYPE "public"."iee_decision_kind" AS ENUM('reaction_window', 'victim_choice');--> statement-breakpoint
CREATE TYPE "public"."iee_decision_status" AS ENUM('pending', 'resolved', 'judged', 'defaulted');--> statement-breakpoint
CREATE TABLE "iee_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" "iee_decision_kind" NOT NULL,
	"status" "iee_decision_status" DEFAULT 'pending' NOT NULL,
	"instance_id" uuid,
	"revision_id" uuid,
	"rule_index" integer,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_choice" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"choice" jsonb,
	"resolved_by_user_id" uuid,
	"cause_journal_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "iee_decisions_settled" CHECK (("iee_decisions"."status" = 'pending' and "iee_decisions"."resolved_at" is null) or ("iee_decisions"."status" <> 'pending' and "iee_decisions"."resolved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "iee_decisions" ADD CONSTRAINT "iee_decisions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_decisions" ADD CONSTRAINT "iee_decisions_player_id_season_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_decisions" ADD CONSTRAINT "iee_decisions_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iee_decisions" ADD CONSTRAINT "iee_decisions_cause_journal_id_iee_journal_id_fk" FOREIGN KEY ("cause_journal_id") REFERENCES "public"."iee_journal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "iee_decisions_season_status_idx" ON "iee_decisions" USING btree ("season_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "iee_decisions_one_pending_uq" ON "iee_decisions" USING btree ("player_id","kind") WHERE "iee_decisions"."status" = 'pending';