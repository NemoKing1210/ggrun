import { randomBytes } from "node:crypto";

import { eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { log } from "@/lib/log";
import { getSiteSettings } from "@/lib/repositories/site-settings.repo";

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
  inviteToken?: string | null;
}): Promise<{ id: string; requiresApproval?: boolean; requiresVerification?: boolean; verificationToken?: string | null }> {
  const email = params.email.trim().toLowerCase();
  if (!email.includes("@")) throw new AuthError("authInvalidEmail");
  if (params.password.length < 8)
    throw new AuthError("authPasswordTooShort");

  const settings = await getSiteSettings();

  // invite token bypasses registrationEnabled check
  let inviteValid = false;
  if (params.inviteToken) {
    const { findInviteToken, consumeInviteToken } = await import("@/lib/repositories/site-settings.repo");
    const inv = await findInviteToken(params.inviteToken);
    if (inv && (!inv.expiresAt || inv.expiresAt > new Date()) && inv.usesCount < inv.maxUses) {
      inviteValid = true;
      await consumeInviteToken(params.inviteToken);
    } else if (params.inviteToken) {
      throw new AuthError("authInviteInvalid");
    }
  }

  if (!settings.registrationEnabled && !inviteValid) {
    throw new AuthError("authRegistrationDisabled");
  }

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

  const mode = settings.registrationMode;
  const needsApproval = mode === "manual_approval" && !inviteValid;
  const needsVerification = mode === "email_link" && !inviteValid;

  let emailVerificationToken: string | null = null;
  let emailVerificationExpiresAt: Date | null = null;
  if (needsVerification) {
    emailVerificationToken = randomBytes(24).toString("base64url");
    emailVerificationExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      username,
      passwordHash,
      displayName: params.displayName?.trim() || username,
      role: "player",
      isApproved: !needsApproval && !needsVerification,
      emailVerified: !needsVerification,
      emailVerificationToken,
      emailVerificationExpiresAt,
    })
    .returning({ id: users.id });
  log.info("auth.register.created", { userId: created!.id, email, username, mode, inviteValid });
  return {
    id: created!.id,
    requiresApproval: needsApproval,
    requiresVerification: needsVerification,
    verificationToken: emailVerificationToken,
  };
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
  if (!user) {
    log.debug("auth.login.bad_credentials", { login: key });
    throw new AuthError("authInvalidCredentials");
  }
  if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    log.debug("auth.login.bad_credentials", { login: key });
    throw new AuthError("authInvalidCredentials");
  }
  const settings = await getSiteSettings();
  if (settings.maintenanceMode && user.role !== "admin") {
    log.debug("auth.login.maintenance", { userId: user.id });
    throw new AuthError("authMaintenance");
  }
  if (!user.isApproved) {
    throw new AuthError("authPendingApproval");
  }
  if (!user.emailVerified) {
    throw new AuthError("authEmailNotVerified");
  }
  log.info("auth.login.verified", { userId: user.id });
  return { id: user.id };
}
