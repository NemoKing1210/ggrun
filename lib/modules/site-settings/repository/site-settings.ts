import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/infrastructure/db";
import { inviteTokens, siteSettings, users } from "@/db/schema";

export type SiteSettings = typeof siteSettings.$inferSelect;
export type RegistrationMode = SiteSettings["registrationMode"];

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await db.select().from(siteSettings).limit(1);
  if (rows[0]) return rows[0];
  // auto-create singleton
  const [created] = await db.insert(siteSettings).values({}).returning();
  if (created) return created;
  const fallback = await db.select().from(siteSettings).limit(1);
  return fallback[0]!;
});

export async function updateSiteSettings(
  patch: Partial<
    Pick<SiteSettings, "registrationEnabled" | "registrationMode" | "maintenanceMode" | "rawgApiKey" | "igdbClientId" | "igdbClientSecret" | "steamApiKey" | "gamespotApiKey" | "proxyEnabled" | "proxyUrl"> & {
      updatedBy?: string | null;
    }
  >,
): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const [updated] = await db
    .update(siteSettings)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(siteSettings.id, current.id))
    .returning();
  return updated ?? current;
}

// ---------------------------------------------------------------------------
// Invite tokens
// ---------------------------------------------------------------------------

export type InviteToken = typeof inviteTokens.$inferSelect;

export async function listInviteTokens(): Promise<InviteToken[]> {
  return db.select().from(inviteTokens).orderBy(inviteTokens.createdAt);
}

export async function createInviteToken(params: {
  token: string;
  createdBy: string | null;
  expiresAt: Date | null;
  maxUses: number;
}): Promise<InviteToken> {
  const [row] = await db
    .insert(inviteTokens)
    .values({
      token: params.token,
      createdBy: params.createdBy,
      expiresAt: params.expiresAt,
      maxUses: params.maxUses,
    })
    .returning();
  return row!;
}

export async function consumeInviteToken(token: string): Promise<boolean> {
  const rows = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token)).limit(1);
  const t = rows[0];
  if (!t) return false;
  if (t.expiresAt && t.expiresAt < new Date()) return false;
  if (t.usesCount >= t.maxUses) return false;
  await db.update(inviteTokens).set({ usesCount: t.usesCount + 1 }).where(eq(inviteTokens.id, t.id));
  return true;
}

export async function deleteInviteToken(id: string): Promise<void> {
  await db.delete(inviteTokens).where(eq(inviteTokens.id, id));
}

export async function findInviteToken(token: string): Promise<InviteToken | null> {
  const rows = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Pending / verification helpers
// ---------------------------------------------------------------------------

export async function listPendingApprovals(): Promise<(typeof users.$inferSelect)[]> {
  const rows = await db.select().from(users).where(eq(users.isApproved, false));
  return rows;
}

export async function listPendingVerifications(): Promise<(typeof users.$inferSelect)[]> {
  // users with token not verified yet
  const rows = await db.select().from(users);
  return rows.filter((u) => !u.emailVerified && !!u.emailVerificationToken);
}
