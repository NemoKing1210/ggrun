CREATE TYPE "public"."reroll_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "reroll_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_player_id" uuid NOT NULL,
	"game_roll_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "reroll_request_status" DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "game_rolls" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "reroll_requests" ADD CONSTRAINT "reroll_requests_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reroll_requests" ADD CONSTRAINT "reroll_requests_game_roll_id_game_rolls_id_fk" FOREIGN KEY ("game_roll_id") REFERENCES "public"."game_rolls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reroll_requests" ADD CONSTRAINT "reroll_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reroll_requests_sp_idx" ON "reroll_requests" USING btree ("season_player_id");--> statement-breakpoint
CREATE INDEX "reroll_requests_game_roll_idx" ON "reroll_requests" USING btree ("game_roll_id");--> statement-breakpoint
CREATE INDEX "reroll_requests_status_idx" ON "reroll_requests" USING btree ("status");