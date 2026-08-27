ALTER TABLE "site_settings" ADD COLUMN "proxy_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "proxy_url" text;