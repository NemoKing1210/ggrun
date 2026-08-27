import { randomBytes } from "node:crypto";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { AdminError } from "@/lib/use-cases/admin";
import {
  getSiteSettings,
  updateSiteSettings,
  createInviteToken,
  deleteInviteToken,
  listInviteTokens,
  listPendingApprovals,
  findInviteToken,
  consumeInviteToken,
} from "@/lib/repositories/site-settings.repo";
import { log } from "@/lib/log";
import { logAdminAction } from "@/lib/repositories/events.repo";

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") throw new AdminError("adminStaffRequired");
  return u;
}

export const siteSettingsSchema = z.object({
  registrationEnabled: z.boolean(),
  registrationMode: z.enum(["open", "manual_approval", "email_link"]),
  maintenanceMode: z.boolean(),
});

export const providerKeysSchema = z.object({
  rawgApiKey: z.string().trim().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  igdbClientId: z.string().trim().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  igdbClientSecret: z.string().trim().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  steamApiKey: z.string().trim().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  gamespotApiKey: z.string().trim().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  proxyEnabled: z.boolean().optional(),
  proxyUrl: z.string().trim().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
});

export async function getSiteSettingsUseCase() {
  return getSiteSettings();
}

export async function updateSiteSettingsUseCase(input: unknown) {
  const actor = await requireAdmin();
  const parsed = siteSettingsSchema.parse(input);
  const updated = await updateSiteSettings({ ...parsed, updatedBy: actor.id });
  await logAdminAction({
    actorId: actor.id,
    actionType: "site_settings_updated",
    targetType: "site_settings",
    targetId: updated.id,
    payload: parsed as Record<string, unknown>,
  });
  log.info("site.settings.updated", { actorId: actor.id, ...parsed });
  return updated;
}

export async function updateProviderKeysUseCase(input: unknown) {
  const actor = await requireAdmin();
  const parsed = providerKeysSchema.parse(input);
  // Normalize: undefined -> do not update, null -> clear, string -> set
  const patch: Record<string, string | null | boolean> = {};
  for (const k of ["rawgApiKey", "igdbClientId", "igdbClientSecret", "steamApiKey", "gamespotApiKey"] as const) {
    if (parsed[k] !== undefined) patch[k] = (parsed[k] ?? null) as string | null;
  }
  if (parsed.proxyEnabled !== undefined) patch.proxyEnabled = parsed.proxyEnabled;
  if (parsed.proxyUrl !== undefined) patch.proxyUrl = (parsed.proxyUrl ?? null) as string | null;
  // Proxy changed through the form -> drop the cached ProxyAgent on next use.
  const { resetProxyAgent } = await import("@/lib/external-fetch");
  if (parsed.proxyEnabled !== undefined || parsed.proxyUrl !== undefined) resetProxyAgent();
  const updated = await updateSiteSettings({ ...patch, updatedBy: actor.id } as never);
  await logAdminAction({
    actorId: actor.id,
    actionType: "provider_keys_updated",
    targetType: "site_settings",
    targetId: updated.id,
    payload: { keys: Object.keys(patch) },
  });
  log.info("site.provider_keys.updated", { actorId: actor.id, keys: Object.keys(patch) });
  return updated;
}

// Invite tokens

export async function listInvitesUseCase() {
  await requireAdmin();
  return listInviteTokens();
}

export async function createInviteUseCase(params: { maxUses?: number; expiresInHours?: number | null }) {
  const actor = await requireAdmin();
  const token = randomBytes(16).toString("base64url");
  const expiresAt =
    params.expiresInHours != null ? new Date(Date.now() + params.expiresInHours * 3600 * 1000) : null;
  const row = await createInviteToken({
    token,
    createdBy: actor.id,
    expiresAt,
    maxUses: params.maxUses ?? 1,
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "invite_created",
    targetType: "invite_token",
    targetId: row.id,
    payload: { token, maxUses: row.maxUses, expiresAt },
  });
  log.info("site.invite.created", { actorId: actor.id, inviteId: row.id });
  return row;
}

export async function deleteInviteUseCase(id: string) {
  const actor = await requireAdmin();
  await deleteInviteToken(id);
  await logAdminAction({
    actorId: actor.id,
    actionType: "invite_deleted",
    targetType: "invite_token",
    targetId: id,
  });
}

export async function listPendingApprovalsUseCase() {
  await requireAdmin();
  return listPendingApprovals();
}

export async function approveUserUseCase(userId: string) {
  const actor = await requireAdmin();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = rows[0];
  if (!u) throw new AdminError("adminPlayerNotFound");
  await db
    .update(users)
    .set({ isApproved: true, emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null })
    .where(eq(users.id, userId));
  await logAdminAction({
    actorId: actor.id,
    actionType: "user_approved",
    targetType: "user",
    targetId: userId,
  });
  log.info("site.user.approved", { actorId: actor.id, userId });
}

export async function rejectUserUseCase(userId: string) {
  const actor = await requireAdmin();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0]) throw new AdminError("adminPlayerNotFound");
  await db.delete(users).where(eq(users.id, userId));
  await logAdminAction({
    actorId: actor.id,
    actionType: "user_rejected",
    targetType: "user",
    targetId: userId,
  });
  log.info("site.user.rejected", { actorId: actor.id, userId });
}

/** Tests a proxy endpoint by performing a small request to RAWG through it. */
export async function testProxyUseCase(proxyUrl: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  let url = proxyUrl.trim();
  if (url === "__USE_CURRENT__") {
    const effective = await (await import("@/lib/external-fetch")).getEffectiveProxy();
    url = effective.url ?? "";
  }
  if (!url) throw new AdminError("proxyUrlInvalid");
  if (!/^https?:\/\//i.test(url)) throw new AdminError("proxyUrlInvalid");
  const { ProxyAgent } = await import("undici");
  const agent = new ProxyAgent(url);
  try {
    const res = await fetch("https://api.rawg.io/api/games?page_size=1", {
      // ignore auth errors — connectivity through the proxy is what matters
      dispatcher: agent,
      signal: AbortSignal.timeout(15000),
    } as RequestInit & { dispatcher?: unknown });
    if (res.status === 401 || res.status === 200) {
      return { ok: true };
    }
    return { ok: false, error: `proxyTestHttp ${res.status}` };
  } catch (e) {
    return { ok: false, error: `proxyTestFailed ${(e as Error).message}` };
  } finally {
    agent.close?.().catch(() => undefined);
  }
}

// Email verification

export async function verifyEmailUseCase(token: string) {
  const rows = await db.select().from(users).where(eq(users.emailVerificationToken, token)).limit(1);
  const u = rows[0];
  if (!u) throw new AdminError("adminPlayerNotFound");
  if (u.emailVerificationExpiresAt && u.emailVerificationExpiresAt < new Date()) {
    throw new AdminError("adminInvalidTransition", { from: "expired", to: "verify" });
  }
  await db
    .update(users)
    .set({ emailVerified: true, isApproved: true, emailVerificationToken: null, emailVerificationExpiresAt: null })
    .where(eq(users.id, u.id));
  log.info("site.email.verified", { userId: u.id });
  return u;
}

export async function resendVerificationUseCase(userId: string) {
  const actor = await requireAdmin();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = rows[0];
  if (!u) throw new AdminError("adminPlayerNotFound");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await db
    .update(users)
    .set({ emailVerificationToken: token, emailVerificationExpiresAt: expiresAt, emailVerified: false })
    .where(eq(users.id, userId));
  await logAdminAction({
    actorId: actor.id,
    actionType: "verification_resent",
    targetType: "user",
    targetId: userId,
    payload: { token },
  });
  log.info("site.verification.resent", { actorId: actor.id, userId });
  return token;
}

export function buildInviteLink(token: string, baseUrl?: string) {
  const base = baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/register?invite=${encodeURIComponent(token)}`;
}

export function buildVerificationLink(token: string, baseUrl?: string) {
  const base = baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}
