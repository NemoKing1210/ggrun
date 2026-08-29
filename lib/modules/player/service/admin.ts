import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/infrastructure/db";
import {
  users,
  sessions,
  seasons,
  seasonPlayers,
  gameRolls,
  gamesCatalog,
  adminAuditLog,
  type AdminAuditLog,
  type Session,
} from "@/db/schema";
import { hashPassword } from "@/lib/infrastructure/auth/password";
import { AdminError } from "@/lib/modules/season/service/errors";
import { logAdminAction } from "@/lib/infrastructure/events";

export async function requireAdmin() {
  const { getCurrentUser } = await import("@/lib/infrastructure/auth/session");
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new AdminError("adminStaffRequired");
  return user;
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: (typeof users.$inferSelect)["role"];
  isBlocked: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
};

export async function listUsers(query: string | undefined): Promise<AdminUserRow[]> {
  const q = query?.trim();
  const rows = q
    ? await db.select().from(users).where(or(ilike(users.email, `%${q}%`), ilike(users.username, `%${q}%`), ilike(users.displayName, `%${q}%`))).orderBy(asc(users.username))
    : await db.select().from(users).orderBy(asc(users.username));
  return rows;
}

export async function getUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Session row with a derived active flag (not expired yet). */
export type AdminSessionRow = Session & { isActive: boolean };

/** All sessions of a user, newest first, with the derived active flag. */
export async function listUserSessions(userId: string): Promise<AdminSessionRow[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));
  const now = Date.now();
  return rows.map((session) => ({
    ...session,
    isActive: session.expiresAt.getTime() > now,
  }));
}

/** One audit entry that involved the user — as the actor or as the target. */
export type AdminUserAuditRow = {
  entry: AdminAuditLog;
  /** true = the user performed the action, false = someone else acted on them. */
  isByUser: boolean;
  /** Username of the actor (null when the entry is by the user themselves). */
  actorName: string;
};

/** Latest audit entries (actor or target = user), newest first. */
export async function listUserAuditTrail(userId: string, limit = 30): Promise<AdminUserAuditRow[]> {
  const [asActor, asTarget] = await Promise.all([
    db
      .select({ entry: adminAuditLog, actorName: users.username })
      .from(adminAuditLog)
      .innerJoin(users, eq(users.id, adminAuditLog.actorId))
      .where(eq(adminAuditLog.actorId, userId))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit),
    db
      .select({ entry: adminAuditLog, actorName: users.username })
      .from(adminAuditLog)
      .innerJoin(users, eq(users.id, adminAuditLog.actorId))
      .where(eq(adminAuditLog.targetId, userId))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit),
  ]);
  const merged: AdminUserAuditRow[] = [
    ...asActor.map((row) => ({ entry: row.entry, isByUser: true, actorName: row.actorName })),
    ...asTarget.map((row) => ({ entry: row.entry, isByUser: false, actorName: row.actorName })),
  ];
  merged.sort((a, b) => b.entry.createdAt.getTime() - a.entry.createdAt.getTime());
  return merged.slice(0, limit);
}

/** Season participation of a user with season context for the detail tabs. */
export type AdminUserSeasonRow = {
  seasonId: string;
  seasonTitle: string;
  seasonSlug: string;
  seasonStatus: (typeof seasons.$inferSelect)["status"];
  position: number;
  balancePoints: number;
  status: (typeof seasonPlayers.$inferSelect)["status"];
  streakPass: number;
  streakDrop: number;
  rerollsUsed: number;
  joinedAt: Date;
};

/** All seasons a user joined, newest first. */
export async function listUserSeasons(userId: string): Promise<AdminUserSeasonRow[]> {
  return db
    .select({
      seasonId: seasons.id,
      seasonTitle: seasons.title,
      seasonSlug: seasons.slug,
      seasonStatus: seasons.status,
      position: seasonPlayers.position,
      balancePoints: seasonPlayers.balancePoints,
      status: seasonPlayers.status,
      streakPass: seasonPlayers.streakPass,
      streakDrop: seasonPlayers.streakDrop,
      rerollsUsed: seasonPlayers.rerollsUsed,
      joinedAt: seasonPlayers.joinedAt,
    })
    .from(seasonPlayers)
    .innerJoin(seasons, eq(seasons.id, seasonPlayers.seasonId))
    .where(eq(seasonPlayers.playerId, userId))
    .orderBy(desc(seasonPlayers.joinedAt));
}

/** Recent game rolls of a user with game + season titles for the detail tabs. */
export type AdminUserRollRow = {
  rollId: string;
  status: (typeof gameRolls.$inferSelect)["status"];
  hoursSpent: string | null;
  rating: number | null;
  rolledAt: Date;
  resolvedAt: Date | null;
  gameTitle: string | null;
  gameCover: string | null;
  seasonTitle: string;
  seasonSlug: string;
};

/** Latest game rolls of a user, newest first. */
export async function listUserRolls(userId: string, limit = 20): Promise<AdminUserRollRow[]> {
  return db
    .select({
      rollId: gameRolls.id,
      status: gameRolls.status,
      hoursSpent: gameRolls.hoursSpent,
      rating: gameRolls.rating,
      rolledAt: gameRolls.rolledAt,
      resolvedAt: gameRolls.resolvedAt,
      gameTitle: gamesCatalog.title,
      gameCover: gamesCatalog.coverUrl,
      seasonTitle: seasons.title,
      seasonSlug: seasons.slug,
    })
    .from(gameRolls)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, gameRolls.seasonPlayerId))
    .innerJoin(seasons, eq(seasons.id, seasonPlayers.seasonId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(seasonPlayers.playerId, userId))
    .orderBy(desc(gameRolls.rolledAt))
    .limit(limit);
}

/** Revokes one session (sessionId given) or all sessions of a user. */
export async function adminRevokeSessions(userId: string, sessionId?: string): Promise<void> {
  const actor = await requireAdmin();
  const target = await getUserById(userId);
  if (!target) throw new AdminError("adminPlayerNotFound");
  if (sessionId) {
    await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));
    await logAdminAction({
      actorId: actor.id,
      actionType: "user_session_revoked",
      targetType: "user",
      targetId: userId,
      payload: { sessionId },
    });
  } else {
    const result = await db.delete(sessions).where(eq(sessions.userId, userId));
    await logAdminAction({
      actorId: actor.id,
      actionType: "user_sessions_revoked",
      targetType: "user",
      targetId: userId,
      payload: { count: result.rowCount ?? 0 },
    });
  }
}

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/, "username: a-z, 0-9, _ -"),
  password: z.string().min(8),
  displayName: z.string().max(100).optional(),
  role: z.enum(["admin", "judge", "player", "viewer"]),
});

export async function adminCreateUser(input: unknown): Promise<string> {
  const actor = await requireAdmin();
  const data = createUserSchema.parse(input);
  const email = data.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
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
  await logAdminAction({ actorId: actor.id, actionType: "user_created", targetType: "user", targetId: created!.id, payload: { email, role: data.role } });
  return created!.id;
}

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  username: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  displayName: z.string().max(100).optional(),
  role: z.enum(["admin", "judge", "player", "viewer"]).optional(),
  password: z.string().min(8).optional(),
});

export async function adminUpdateUser(input: unknown): Promise<void> {
  const actor = await requireAdmin();
  const data = updateUserSchema.parse(input);
  const target = await getUserById(data.userId);
  if (!target) throw new AdminError("adminPlayerNotFound");
  if (data.role !== undefined && target.id === actor.id && data.role !== "admin") throw new AdminError("adminSelfDemote");
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
  await logAdminAction({ actorId: actor.id, actionType: "user_updated", targetType: "user", targetId: target.id, payload });
}

export async function adminSetUserBlocked(userId: string, isBlocked: boolean): Promise<void> {
  const actor = await requireAdmin();
  if (userId === actor.id) throw new AdminError("adminSelfBlock");
  const target = await getUserById(userId);
  if (!target) throw new AdminError("adminPlayerNotFound");
  await db.update(users).set({ isBlocked }).where(eq(users.id, userId));
  await logAdminAction({ actorId: actor.id, actionType: isBlocked ? "user_blocked" : "user_unblocked", targetType: "user", targetId: userId });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const actor = await requireAdmin();
  if (userId === actor.id) throw new AdminError("adminSelfDelete");
  const target = await getUserById(userId);
  if (!target) throw new AdminError("adminPlayerNotFound");
  await db.delete(users).where(eq(users.id, userId));
  await logAdminAction({ actorId: actor.id, actionType: "user_deleted", targetType: "user", targetId: userId, payload: { username: target.username } });
}
