CREATE TABLE "bot_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"action" text NOT NULL,
	"season_player_id" uuid,
	"bot_username" text,
	"message" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"status" text DEFAULT 'paused' NOT NULL,
	"config" jsonb DEFAULT '{"botCount":3,"actionsPerTick":2,"tickIntervalMs":2000,"passWeight":70,"dropWeight":20,"rerollWeight":10,"enableRoll":true,"enableResolve":true,"stopOnError":false}'::jsonb NOT NULL,
	"total_ticks" integer DEFAULT 0 NOT NULL,
	"total_actions" integer DEFAULT 0 NOT NULL,
	"total_errors" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_logs" ADD CONSTRAINT "bot_logs_run_id_bot_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."bot_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_runs" ADD CONSTRAINT "bot_runs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_logs_run_created_idx" ON "bot_logs" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "bot_logs_run_level_idx" ON "bot_logs" USING btree ("run_id","level");