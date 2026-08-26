import type { Metadata } from "next";
import Link from "next/link";
import { Big_Shoulders_Stencil, Share_Tech_Mono, Barlow_Condensed } from "next/font/google";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import "./globals.css";

const stencil = Big_Shoulders_Stencil({
  variable: "--font-stencil",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const techMono = Share_Tech_Mono({
  variable: "--font-tech-mono",
  subsets: ["latin"],
  weight: "400",
});
const body = Barlow_Condensed({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "GGRun — игровой забег",
  description: "Платформа командного игрового ивента",
};

const navLinks = [
  { href: "/", label: "Главная" },
  { href: "/board", label: "Поле" },
  { href: "/leaderboard", label: "Лидерборд" },
  { href: "/feed", label: "Лента" },
  { href: "/rules", label: "Правила" },
];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  return (
    <html lang="ru">
      <body
        className={`${stencil.variable} ${techMono.variable} ${body.variable} antialiased`}
      >
        <div className="hazard-tape" aria-hidden />
        <header className="border-b border-[#3d3d34] bg-[#151514]">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link
              href="/"
              className="font-display text-2xl tracking-widest text-amber uppercase"
            >
              GGRun
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
              {user ? (
                <>
                  <Link href="/dashboard" className="hover:text-amber">
                    {user.displayName ?? user.username}
                  </Link>
                  {isStaff(user) && (
                    <Link href="/admin" className="text-military hover:text-amber">
                      Админка
                    </Link>
                  )}
                  <form action={logoutAction}>
                    <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                      Выход
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="hud-btn hud-btn-primary !py-1 !px-3 text-xs">
                  Войти
                </Link>
              )}
            </span>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-[#3d3d34] py-4 text-center text-xs text-dim">
          GGRun · сезонный игровой забег
        </footer>
      </body>
    </html>
  );
}

