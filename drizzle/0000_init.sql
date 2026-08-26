CREATE TYPE "public"."cell_type" AS ENUM('start', 'finish', 'normal', 'penalty', 'event', 'bonus', 'teleport', 'custom');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'finished', 'eliminated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."roll_status" AS ENUM('rolled', 'in_progress', 'passed', 'dropped', 'rerolled');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('draft', 'active', 'paused', 'finished', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'judge', 'player', 'viewer');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"cell_type" "cell_type" DEFAULT 'normal' NOT NULL,
	"label" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "board_cells_board_position_uq" UNIQUE("board_id","position")
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text DEFAULT 'Основное поле' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"season_player_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_rolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_player_id" uuid NOT NULL,
	"game_id" uuid,
	"status" "roll_status" DEFAULT 'rolled' NOT NULL,
	"hours_spent" numeric,
	"difficulty_level" integer,
	"notes" text,
	"rolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "games_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"platform" text,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cover_url" text,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"is_blacklisted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_player_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"related_move_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_player_id" uuid NOT NULL,
	"game_roll_id" uuid,
	"from_position" integer NOT NULL,
	"to_position" integer NOT NULL,
	"dice_results" integer[] NOT NULL,
	"cell_landed_type" "cell_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"balance_points" integer DEFAULT 0 NOT NULL,
	"status" "player_status" DEFAULT 'active' NOT NULL,
	"streak_pass" integer DEFAULT 0 NOT NULL,
	"streak_drop" integer DEFAULT 0 NOT NULL,
	"rerolls_used" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_players_season_player_uq" UNIQUE("season_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" "season_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rules_md" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"username" text NOT NULL,
	"password_hash" text,
	"display_name" text,
	"avatar_url" text,
	"twitch_login" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rolls" ADD CONSTRAINT "game_rolls_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rolls" ADD CONSTRAINT "game_rolls_game_id_games_catalog_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_related_move_id_moves_id_fk" FOREIGN KEY ("related_move_id") REFERENCES "public"."moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_season_player_id_season_players_id_fk" FOREIGN KEY ("season_player_id") REFERENCES "public"."season_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_roll_id_game_rolls_id_fk" FOREIGN KEY ("game_roll_id") REFERENCES "public"."game_rolls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_players" ADD CONSTRAINT "season_players_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_players" ADD CONSTRAINT "season_players_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_log_season_created_idx" ON "event_log" USING btree ("season_id","created_at");--> statement-breakpoint
CREATE INDEX "game_rolls_sp_status_idx" ON "game_rolls" USING btree ("season_player_id","status");--> statement-breakpoint
CREATE INDEX "season_players_season_pos_idx" ON "season_players" USING btree ("season_id","position");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");