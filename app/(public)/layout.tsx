import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { SiteHeader } from "@/components/layout/SiteHeader";
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
    <>
      <div className="hazard-tape" aria-hidden />
      <SiteHeader
        locale={locale}
        t={t}
        user={
          user
            ? {
                displayName: user.displayName,
                username: user.username,
                isStaff: isStaff(user),
              }
            : null
        }
      />
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <Breadcrumbs />
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="mt-16 border-t border-[#3d3d34] py-4 text-center text-xs text-dim">
        {t.core.footer.tagline}
      </footer>
    </>
  );
}
