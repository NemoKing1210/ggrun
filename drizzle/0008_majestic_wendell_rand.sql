CREATE TYPE "public"."completion_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "completion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_player_id" uuid NOT NULL,
	"game_roll_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"rating" integer,
	"status" "completion_request_status" DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "completion_requests" ADD CONSTRAINT "completion_requests_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_requests" ADD CONSTRAINT "completion_requests_game_roll_id_game_rolls_id_fk" FOREIGN KEY ("game_roll_id") REFERENCES "public"."game_rolls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_requests" ADD CONSTRAINT "completion_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "completion_requests_sp_idx" ON "completion_requests" USING btree ("season_player_id");--> statement-breakpoint
CREATE INDEX "completion_requests_game_roll_idx" ON "completion_requests" USING btree ("game_roll_id");--> statement-breakpoint
CREATE INDEX "completion_requests_status_idx" ON "completion_requests" USING btree ("status");