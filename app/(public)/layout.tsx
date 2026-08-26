import Link from "next/link";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { getT } from "@/lib/i18n/server";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

/** Публичная оболочка: шапка сайта + подвал. */
export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  const navLinks = [
    { href: "/", label: t.core.nav.home },
    { href: "/board", label: t.core.nav.board },
    { href: "/leaderboard", label: t.core.nav.leaderboard },
    { href: "/feed", label: t.core.nav.feed },
    { href: "/rules", label: t.core.nav.rules },
  ];
  return (
    <>
      <div className="hazard-tape" aria-hidden />
      <header className="border-b border-[#3d3d34] bg-[#151514]">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link
            href="/"
            className="font-display text-2xl tracking-widest text-amber uppercase"
          >
            {t.core.common.appName}
          </Link>
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-dim hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-4">
            <LocaleSwitcher current={locale} />
            {user ? (
              <>
                <Link href="/dashboard" className="hover:text-amber">
                  {user.displayName ?? user.username}
                </Link>
                {isStaff(user) && (
                  <Link
                    href="/admin"
                    className="hud-btn hud-btn-primary !py-1 !px-3 text-xs"
                  >
                    {t.core.nav.admin}
                  </Link>
                )}
                <form action={logoutAction}>
                  <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                    {t.core.nav.logout}
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="hud-btn hud-btn-primary !py-1 !px-3 text-xs">
                {t.core.nav.login}
              </Link>
            )}
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mt-16 border-t border-[#3d3d34] py-4 text-center text-xs text-dim">
        {t.core.footer.tagline}
      </footer>
    </>
  );
}
