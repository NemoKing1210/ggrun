import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { registrationModeEnum } from "./enums";
import { users } from "./users";

// Site-wide settings, invite tokens & admin audit log

export const siteSettings = pgTable("site_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
  registrationMode: registrationModeEnum("registration_mode").notNull().default("open"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  // External game provider API keys — DB overrides env when set. Null/empty means fallback to env.
  rawgApiKey: text("rawg_api_key"),
  igdbClientId: text("igdb_client_id"),
  igdbClientSecret: text("igdb_client_secret"),
  steamApiKey: text("steam_api_key"),
  gamespotApiKey: text("gamespot_api_key"),
  /** Outbound proxy for external APIs (game providers). DB overrides env PROXY_URL. */
  proxyEnabled: boolean("proxy_enabled").notNull().default(false),
  proxyUrl: text("proxy_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const inviteTokens = pgTable(
  "invite_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses").notNull().default(1),
    usesCount: integer("uses_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invite_tokens_token_idx").on(t.token)],
);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SiteSettings = typeof siteSettings.$inferSelect;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;