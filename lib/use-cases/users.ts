import { asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { AdminError } from "@/lib/use-cases/admin";
import { logAdminAction } from "@/lib/repositories/events.repo";
import { MAX_BIO_LENGTH } from "@/lib/profile";
import { ACCENT_KEYS, type AccentKey } from "@/lib/accent";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n/config";

/** User management — admin role only (not judge). */
export async function requireAdmin() {
  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new AdminError("adminStaffRequired");
  }
  return user;
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  role: (typeof users.$inferSelect)["role"];
  isBlocked: boolean;
  createdAt: Date;
};

export async function listUsers(query: string | undefined): Promise<AdminUserRow[]> {
  const q = query?.trim();
  const rows = q
    ? await db
        .select()
        .from(users)
        .where(
          or(
            ilike(users.email, `%${q}%`),
            ilike(users.username, `%${q}%`),
            ilike(users.displayName, `%${q}%`),
          ),
        )
        .orderBy(asc(users.username))
    : await db.select().from(users).orderBy(asc(users.username));
  return rows;
}

export async function getUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, "username: a-z, 0-9, _ -"),
  password: z.string().min(8),
  displayName: z.string().max(100).optional(),
  role: z.enum(["admin", "judge", "player", "viewer"]),
});

export async function adminCreateUser(input: unknown): Promise<string> {
  const actor = await requireAdmin();
  const data = createUserSchema.parse(input);
  const email = data.email.trim().toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) throw new AdminError("authUserExists");

  const [created] = await db
    .insert(users)
    .values({
      email,
      username: data.username.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      displayName: data.displayName?.trim() || data.username,
      role: data.role,
    })
    .returning({ id: users.id });

  await logAdminAction({
    actorId: actor.id,
    actionType: "user_created",
    targetType: "user",
    targetId: created!.id,
    payload: { email, role: data.role },
  });
  return created!.id;
}

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  username: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  displayName: z.string().max(100).optional(),
  role: z.enum(["admin", "judge", "player", "viewer"]).optional(),
  password: z.string().min(8).optional(),
});

export async function adminUpdateUser(input: unknown): Promise<void> {
  const actor = await requireAdmin();
  const data = updateUserSchema.parse(input);
  const target = await getUserById(data.userId);
  if (!target) throw new AdminError("adminPlayerNotFound");

  // Cannot demote yourself — risk of losing admin access
  if (data.role !== undefined && target.id === actor.id && data.role !== "admin") {
    throw new AdminError("adminSelfDemote");
  }

  const patch: Partial<typeof users.$inferInsert> = {};
  const payload: Record<string, unknown> = {};
  if (data.email !== undefined) {
    patch.email = data.email.trim().toLowerCase();
    payload.email = data.email;
  }
  if (data.username !== undefined) {
    patch.username = data.username.toLowerCase();
    payload.username = data.username;
  }
  if (data.displayName !== undefined) {
    patch.displayName = data.displayName;
    payload.displayName = data.displayName;
  }
  if (data.role !== undefined) {
    patch.role = data.role;
    payload.role = data.role;
  }
  if (data.password !== undefined) {
    patch.passwordHash = await hashPassword(data.password);
    payload.password = "***";
  }

  await db.update(users).set(patch).where(eq(users.id, target.id));
  await logAdminAction({
    actorId: actor.id,
    actionType: "user_updated",
    targetType: "user",
    targetId: target.id,
    payload,
  });
}

export async function adminSetUserBlocked(userId: string, isBlocked: boolean): Promise<void> {
  const actor = await requireAdmin();
  if (userId === actor.id) throw new AdminError("adminSelfBlock");
  const target = await getUserById(userId);
  if (!target) throw new AdminError("adminPlayerNotFound");
  await db.update(users).set({ isBlocked }).where(eq(users.id, userId));
  await logAdminAction({
    actorId: actor.id,
    actionType: isBlocked ? "user_blocked" : "user_unblocked",
    targetType: "user",
    targetId: userId,
  });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const actor = await requireAdmin();
  if (userId === actor.id) throw new AdminError("adminSelfDelete");
  const target = await getUserById(userId);
  if (!target) throw new AdminError("adminPlayerNotFound");
  await db.delete(users).where(eq(users.id, userId));
  await logAdminAction({
    actorId: actor.id,
    actionType: "user_deleted",
    targetType: "user",
    targetId: userId,
    payload: { username: target.username },
  });
}

// --- Self-service settings -------------------------------------------------

import { NETWORKS, isValidUrlForNetwork, type Network } from "@/lib/networks";
export type { Network };

export const userLinksSchema = z
  .array(
    z
      .object({
        network: z.enum(NETWORKS),
        url: z.string().url().max(500),
      })
      .superRefine((val, ctx) => {
        if (!isValidUrlForNetwork(val.network as Network, val.url)) {
          ctx.addIssue({
            code: "custom",
            path: ["url"],
            message: `URL must be a ${val.network} link`,
          });
        }
      }),
  )
  .max(6);

export const updateUserSettingsSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(MAX_BIO_LENGTH),
  avatarUrl: z
    .union([
      z.string().url(),
      // Inline resized avatar (data:image/...;base64, max ~300 KB)
      z
        .string()
        .regex(/^data:image\/(png|jpe?g|webp);base64,/)
        .max(300_000),
      z.literal(""),
    ])
    .optional(),
  bannerUrl: z
    .union([
      z.string().url(),
      // Inline resized banner (data:image/...;base64, max ~500 KB — 1500×500 JPEG @ 0.85)
      z
        .string()
        .regex(/^data:image\/(png|jpe?g|webp);base64,/)
        .max(500_000),
      z.literal(""),
    ])
    .optional(),
  accent: z.enum(ACCENT_KEYS),
  locale: z.enum(LOCALES),
  links: userLinksSchema,
});

/** Updates the current user's public profile & preferences. Self-service. */
export async function updateUserSettings(input: unknown): Promise<void> {
  const user = await requireLogin();
  const data = updateUserSettingsSchema.parse(input);
  await db
    .update(users)
    .set({
      displayName: data.displayName,
      bio: data.bio || null,
      avatarUrl: data.avatarUrl === undefined ? undefined : data.avatarUrl || null,
      bannerUrl: data.bannerUrl === undefined ? undefined : data.bannerUrl || null,
      accent: data.accent as AccentKey,
      locale: data.locale as Locale,
      links: data.links as unknown as Record<string, unknown>[],
    })
    .where(eq(users.id, user.id));
}

 /** Updates only the locale preference for the current user. No-op for anonymous visitors. */
export async function setUserLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (!user) return;
  await db
    .update(users)
    .set({ locale: locale as Locale })
    .where(eq(users.id, user.id));
}

async function requireLogin() {
  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (!user) throw new AdminError("authLoginRequired");
  return user;
}
