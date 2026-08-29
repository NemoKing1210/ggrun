import { index, jsonb, timestamp, uuid, boolean, pgTable, text } from "drizzle-orm/pg-core";

import { userRoleEnum } from "./enums";

// Users & sessions (local replacement for Supabase Auth: profiles on top of our own users)

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  /** Wide profile banner (3:1), cropped & resized on upload; shown on the public profile. */
  bannerUrl: text("banner_url"),
  twitchLogin: text("twitch_login"),
  role: userRoleEnum("role").notNull().default("viewer"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  /** Short self-description shown on the public profile. */
  bio: text("bio"),
  /** External profile links: [{ network, url }] shown on the public profile. */
  links: jsonb("links").notNull().default([]),
  /** Accent color key from the ACCENTS palette (lib/accent.ts). */
  accent: text("accent").notNull().default("amber"),
  /** Preferred site language; overrides the locale cookie when set. */
  locale: text("locale"),
  /** Email verification & manual approval flags for registration flows. */
  isApproved: boolean("is_approved").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
  /** Last time the user made an authenticated request — used for online presence. */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;