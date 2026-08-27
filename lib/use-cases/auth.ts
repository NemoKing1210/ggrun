import { eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { log } from "@/lib/log";

export class AuthError extends Error {
  /** Error code; the text is resolved via the i18n dictionary in server actions. */
  constructor(public readonly code: string) {
    super(code);
  }
}

function deriveUsername(email: string): string {
  const base = email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return base.length > 0 ? base : `user${Date.now().toString(36)}`;
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${base}${Math.floor(Math.random() * 10000)}`;
  }
  log.error("auth.username.exhausted", {
    base,
    err: new Error("Could not generate a unique username"),
  });
  throw new AuthError("authUsernameFailed");
}

export async function registerUser(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ id: string }> {
  const email = params.email.trim().toLowerCase();
  if (!email.includes("@")) throw new AuthError("authInvalidEmail");
  if (params.password.length < 8)
    throw new AuthError("authPasswordTooShort");

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    log.debug("auth.register.duplicate_email", { email });
    throw new AuthError("authUserExists");
  }

  const username = await uniqueUsername(deriveUsername(email));
  const passwordHash = await hashPassword(params.password);
  const [created] = await db
    .insert(users)
    .values({
      email,
      username,
      passwordHash,
      displayName: params.displayName?.trim() || username,
      role: "player",
    })
    .returning({ id: users.id });
  log.info("auth.register.created", { userId: created!.id, email, username });
  return created!;
}

export async function authenticate(
  login: string,
  password: string,
): Promise<{ id: string }> {
  const key = login.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(users.email, key), eq(users.username, key)))
    .limit(1);
  const user = rows[0];
  if (user?.isBlocked) {
    log.debug("auth.login.blocked", { userId: user.id });
    throw new AuthError("authBlocked");
  }
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    log.debug("auth.login.bad_credentials", { login: key });
    throw new AuthError("authInvalidCredentials");
  }
  log.info("auth.login.verified", { userId: user.id });
  return { id: user.id };
}
