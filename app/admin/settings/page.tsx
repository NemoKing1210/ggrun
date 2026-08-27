import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getSiteSettings, listInviteTokens } from "@/lib/repositories/site-settings.repo";
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

  return (
    <GlobalSettingsForm
      initial={{
        registrationEnabled: settings.registrationEnabled,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registrationMode: settings.registrationMode as any,
        maintenanceMode: settings.maintenanceMode,
      }}
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
