import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { PageContainer } from "@/components/ui/PageContainer";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.core.auth.registerMetaTitle };
}
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const { getSiteSettings } = await import("@/lib/repositories/site-settings.repo");
  const settings = await getSiteSettings();
  return (
    <PageContainer>
      <RegisterForm invite={invite ?? null} registrationEnabled={settings.registrationEnabled} maintenanceMode={settings.maintenanceMode} />
    </PageContainer>
  );
}
