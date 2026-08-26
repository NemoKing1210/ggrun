import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { getT } from "@/lib/i18n/server";

/**
 * Админская оболочка: собственная «консольная» шапка с разделами админки
 * и переключателем обратно на сайт. Доступ — только staff.
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
  ];

  return (
    <>
      <div className="hazard-tape" aria-hidden />
      <header className="border-b border-[#55554a] bg-[#0f0f0e]">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <span className="font-display text-xl tracking-widest text-military uppercase">
            &gt;_ {t.admin.nav.console}
          </span>
          {adminNav.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-mono text-xs uppercase tracking-widest text-dim hover:text-amber transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-3">
            <span className="font-mono text-xs text-military">
              {user.displayName ?? user.username}
            </span>
            <Link href="/" className="hud-btn !py-1 !px-3 text-xs">
              {t.admin.nav.backToSite}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="hud-btn hud-btn-danger !py-1 !px-3 text-xs">
                {t.core.nav.logout}
              </button>
            </form>
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="mt-16 border-t border-[#3d3d34] py-4 text-center text-xs text-dim">
        {t.core.footer.tagline}
      </footer>
    </>
  );
}
