import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

// Per-user notifications inbox. The flexible payload (title/body i18n keys +
// params, icon, image, link, action buttons, integration data) is shaped by
// the pure builders in `lib/engine/notifications/` — this table only stores it.

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Machine key from the engine registry (e.g. `player_added`,
    // `reroll_approved`). Never rendered directly — resolved via dictionaries.
    kind: text("kind").notNull(),
    // i18n keys into the `notifications` namespace (`title.<key>`,
    // `body.<key>`), plus interpolation params. Language-agnostic by design:
    // the client renders in its own locale.
    titleKey: text("title_key").notNull(),
    bodyKey: text("body_key").notNull(),
    params: jsonb("params").notNull().default({}),
    // `info` | `success` | `warning` | `danger`. Drives the HUD accent.
    severity: text("severity").notNull().default("info"),
    // Optional Heroicon key from the engine registry (e.g. `UserPlusIcon`).
    // Null = kind default. The client maps it — never a raw component name
    // from user input.
    icon: text("icon"),
    // Optional square artwork / cover shown on the card.
    imageUrl: text("image_url"),
    // Where the whole card navigates on click (in-app path).
    href: text("href"),
    // Action buttons: [{ id, labelKey, href?, style? }]. Rendered from the
    // dictionary, same i18n contract as title/body.
    actions: jsonb("actions").notNull().default([]),
    // Integration payload: { seasonId?, seasonPlayerId?, gameId?, rollId?,
    // requestId?, outcome?, seasonTitle?, gameTitle?, ... }. Opaque to the
    // table — interpreted by the client panels that render the card.
    data: jsonb("data").notNull().default({}),
    // Client-set idempotency key (e.g. `reroll:approved:<requestId>`). Lets
    // publishers retry safely; enforced in the service, not the DB.
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
