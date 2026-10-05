import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { fileVisibilityEnum } from "./enums";
import { users } from "./users";

// Uploaded files — metadata only; the bytes live in the configured storage
// driver (`lib/infrastructure/storage`). `key` is the object's identity in that
// backend, and the row is the single source of truth for what the object is,
// who owns it and who may read it.
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Storage key: `<category>/<yyyy>/<mm>/<uuid>.<ext>`. Unique forever, even after a soft delete. */
    key: text("key").notNull(),
    /** Category id from the code-side registry (`lib/modules/files/service/categories.ts`). */
    category: text("category").notNull(),
    /** Uploader; null for system-created files and after the user is deleted. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** MIME type detected from the bytes, never trusted from the client. */
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 hex of the stored bytes. */
    checksum: text("checksum").notNull(),
    /** Pixel dimensions for images; null for other types. */
    width: integer("width"),
    height: integer("height"),
    /** `public` → anyone with the link; `private` → signed link or owner/staff session. */
    visibility: fileVisibilityEnum("visibility").notNull().default("public"),
    /** Category-specific extras (e.g. the original file name). */
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete: the row stays for the audit trail, the object is removed from the driver. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("files_key_uq").on(t.key),
    index("files_owner_idx").on(t.ownerId),
    index("files_category_idx").on(t.category),
    index("files_created_idx").on(t.createdAt),
  ],
);

export type FileRecord = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
