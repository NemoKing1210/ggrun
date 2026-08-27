import type { Metadata } from "next";

import { getT } from "@/lib/i18n/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { PageContainer } from "@/components/ui/PageContainer";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.core.auth.loginMetaTitle };
}

export default function LoginPage() {
  return (
    <PageContainer>
      <LoginForm />
    </PageContainer>
  );
}
