import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
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
    { href: "/admin/games", label: t.admin.nav.catalog },
    { href: "/admin/audit", label: t.admin.nav.audit },
    { href: "/admin/rerolls", label: t.admin.nav.rerolls },
    ...(user.role === "admin"
      ? [{ href: "/admin/settings", label: t.admin.nav.settings }]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="hazard-tape" aria-hidden />
      <AdminHeader
        navLinks={adminNav}
        userName={user.displayName ?? user.username}
        userAvatar={user.avatarUrl}
        username={user.username}
        t={t}
      />
      <div className="mx-auto w-full max-w-7xl px-4 pt-4">
        <Breadcrumbs />
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
      <SiteFooter t={t} showAdmin wide />
    </div>
  );
}
