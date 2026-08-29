import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentSession, getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { PageContainer } from "@/components/ui/PageContainer";
import { listUserSessions } from "@/lib/modules/player/service/admin";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.settings.metaTitle };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const { tab } = await searchParams;
  const initialTab = tab === "sessions" ? ("sessions" as const) : ("profile" as const);
  let sessions: Awaited<ReturnType<typeof listUserSessions>> = [];
  let currentSession: Awaited<ReturnType<typeof getCurrentSession>> = null;
  try {
    [sessions, currentSession] = await Promise.all([
      listUserSessions(user.id),
      getCurrentSession(),
    ]);
  } catch {
    sessions = [];
    currentSession = null;
  }

  return (
    <PageContainer>
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {t.settings.heading}
      </h1>
      <div className="hazard-tape my-4" aria-hidden />
      <p className="mb-6 text-sm text-dim">{t.settings.intro}</p>
      <Suspense fallback={<div className="hud-card p-5 font-mono text-xs text-dim">{t.settings.tabs.profile}…</div>}>
        <SettingsTabs
          initialTab={initialTab}
          user={{
            displayName: user.displayName,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            bannerUrl: user.bannerUrl,
            accent: user.accent,
            locale: user.locale,
            links: user.links,
          }}
          sessions={sessions}
          currentSessionId={currentSession?.id ?? null}
        />
      </Suspense>
    </PageContainer>
  );
}
