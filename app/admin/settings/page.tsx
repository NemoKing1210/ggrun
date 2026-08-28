import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getSiteSettings, listInviteTokens } from "@/lib/repositories/site-settings.repo";
import { maskKey } from "@/lib/game-providers/keys";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { GlobalSettingsForm } from "@/components/admin/GlobalSettingsForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.siteSettings.heading} — GGRun` };
}

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/admin");

  const { t } = await getT();
  const settings = await getSiteSettings();
  const invites = await listInviteTokens();

  // pending: isApproved false OR (emailVerificationToken not null && not verified)
  const allUsers = await db.select().from(users);
  const pending = allUsers.filter((u) => !u.isApproved || (!u.emailVerified && !!u.emailVerificationToken));

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const providerKeys = {
    rawgApiKeyMasked: maskKey((settings as unknown as Record<string, unknown>).rawgApiKey as string | null),
    igdbClientIdMasked: maskKey((settings as unknown as Record<string, unknown>).igdbClientId as string | null),
    igdbClientSecretMasked: maskKey((settings as unknown as Record<string, unknown>).igdbClientSecret as string | null),
    steamApiKeyMasked: maskKey((settings as unknown as Record<string, unknown>).steamApiKey as string | null),
    gamespotApiKeyMasked: maskKey((settings as unknown as Record<string, unknown>).gamespotApiKey as string | null),
    proxyUrlMasked: (() => {
      const s = settings as unknown as Record<string, unknown>;
      const dbOn = Boolean(s.proxyEnabled) && Boolean(s.proxyUrl);
      const dbUrl = typeof s.proxyUrl === "string" ? s.proxyUrl : null;
      const envUrl = process.env.PROXY_URL ?? null;
      return maskKey(dbOn && dbUrl ? dbUrl : (envUrl ?? null));
    })(),
    proxyUrlDbValue: (() => {
      const s = settings as unknown as Record<string, unknown>;
      return typeof s.proxyUrl === "string" && s.proxyUrl.trim() ? s.proxyUrl : null;
    })(),
    proxyUrlEnvRaw: process.env.PROXY_URL ?? null,
    proxyUrlEnvMasked: maskKey(process.env.PROXY_URL ?? null),
    hasDb: {
      rawg: Boolean((settings as unknown as Record<string, unknown>).rawgApiKey),
      igdb: Boolean((settings as unknown as Record<string, unknown>).igdbClientId && (settings as unknown as Record<string, unknown>).igdbClientSecret),
      steam: Boolean((settings as unknown as Record<string, unknown>).steamApiKey),
      gamespot: Boolean((settings as unknown as Record<string, unknown>).gamespotApiKey),
      proxy: Boolean((settings as unknown as Record<string, unknown>).proxyEnabled && (settings as unknown as Record<string, unknown>).proxyUrl),
    },
    hasEnv: {
      rawg: Boolean(process.env.RAWG_API_KEY),
      igdb: Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET),
      steam: Boolean(process.env.STEAM_WEB_API_KEY),
      gamespot: Boolean(process.env.GAMESPOT_API_KEY),
      proxy: Boolean(process.env.PROXY_URL),
    },
  };

  return (
    <GlobalSettingsForm
      initial={{
        registrationEnabled: settings.registrationEnabled,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registrationMode: settings.registrationMode as any,
        maintenanceMode: settings.maintenanceMode,
      }}
      providerKeys={providerKeys}
      invites={invites.map((i) => ({
        id: i.id,
        token: i.token,
        maxUses: i.maxUses,
        usesCount: i.usesCount,
        expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
        createdAt: i.createdAt.toISOString(),
      }))}
      pending={pending.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        displayName: u.displayName,
        isApproved: u.isApproved,
        emailVerified: u.emailVerified,
        emailVerificationToken: u.emailVerificationToken,
        createdAt: u.createdAt.toISOString(),
      }))}
      t={t}
      baseUrl={baseUrl}
    />
  );
}
