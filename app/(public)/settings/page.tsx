import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { PageContainer } from "@/components/ui/PageContainer";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.settings.metaTitle };
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();

  return (
    <PageContainer>
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {t.settings.heading}
      </h1>
      <div className="hazard-tape my-4" aria-hidden />
      <p className="mb-6 text-sm text-dim">{t.settings.intro}</p>
      <SettingsForm
        displayName={user.displayName}
        bio={user.bio}
        avatarUrl={user.avatarUrl}
        accent={user.accent}
        locale={user.locale}
        links={user.links}
      />
    </PageContainer>
  );
}
