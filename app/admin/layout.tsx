import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { AdminHeader } from "@/components/layout/AdminHeader";

/**
 * Admin shell: its own console-style header with admin sections
 * and a switch back to the public site. Access limited to staff.
 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "judge") redirect("/");

  const adminNav = [
    { href: "/admin", label: t.admin.nav.dashboard },
    { href: "/admin/seasons", label: t.admin.nav.seasons },
    ...(user.role === "admin"
      ? [{ href: "/admin/users", label: t.admin.nav.users }]
      : []),
    { href: "/admin/games-catalog", label: t.admin.nav.catalog },
    { href: "/admin/audit", label: t.admin.nav.audit },
    { href: "/admin/rerolls", label: t.admin.nav.rerolls },
  ];

  return (
    <>
      <div className="hazard-tape" aria-hidden />
      <AdminHeader
        navLinks={adminNav}
        userName={user.displayName ?? user.username}
        t={t}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="mt-16 border-t border-[#3d3d34] py-4 text-center text-xs text-dim">
        {t.core.footer.tagline}
      </footer>
    </>
  );
}
