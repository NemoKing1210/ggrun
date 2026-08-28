import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/lib/infrastructure/db";
import { log } from "@/lib/infrastructure/logger";
import { isDbConnectionError } from "@/lib/infrastructure/db/health";
import { sessions, users, type User } from "@/db/schema";

export const SESSION_COOKIE = "ggrun_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    tokenHash: tokenFingerprint(token),
    expiresAt,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

/** Returns the current user from the cookie session, or null. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let rows: { user: User }[];
  try {
    rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenFingerprint(token)),
          gt(sessions.expiresAt, new Date()),
          eq(users.isBlocked, false),
        ),
      )
      .limit(1);
  } catch (error) {
    // DB unreachable → treat as anonymous so the root layout can render the
    // "site unavailable" screen instead of crashing on session resolution.
    if (!isDbConnectionError(error)) throw error;
    const authLog = log.child({ scope: "auth" });
    authLog.warn("database unreachable while resolving session", {
      err: error instanceof Error ? error : undefined,
    });
    return null;
  }
  return rows[0]?.user ?? null;
});

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, tokenFingerprint(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** staff = admin or judge — access to the admin area and judge actions. */
export function isStaff(user: User | null): boolean {
  return user !== null && (user.role === "admin" || user.role === "judge");
}
