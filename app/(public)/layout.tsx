import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
/** Public shell: site header + footer. */
export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="hazard-tape" aria-hidden />
      <SiteHeader
        locale={locale}
        t={t}
        user={
          user
            ? {
                displayName: user.displayName,
                username: user.username,
                avatarUrl: user.avatarUrl,
                isStaff: isStaff(user),
              }
            : null
        }
      />
      <div className="mx-auto w-full max-w-6xl px-4 pt-4">
        <Breadcrumbs />
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
      <SiteFooter t={t} showAdmin={user ? isStaff(user) : false} />
    </div>
  );
}
