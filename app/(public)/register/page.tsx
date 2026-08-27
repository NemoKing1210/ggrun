import type { Metadata } from "next";

import { getT } from "@/lib/i18n/server";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { PageContainer } from "@/components/ui/PageContainer";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.core.auth.registerMetaTitle };
}

export default function RegisterPage() {
  return (
    <PageContainer>
      <RegisterForm />
    </PageContainer>
  );
}
