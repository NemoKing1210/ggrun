import type { Metadata } from "next";
import { Big_Shoulders_Stencil, Share_Tech_Mono, Barlow_Condensed } from "next/font/google";

import { getT } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { TopLoader } from "@/components/ui/top-loader";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getAccent } from "@/lib/shared/ui/accent";
import { isDbAvailable } from "@/lib/infrastructure/db/health";
import { SiteUnavailableScreen } from "@/components/system/site-unavailable-screen";
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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t.core.footer.metaTitle,
    description: t.core.footer.metaDescription,
    authors: [{ name: "NemoKing1210", url: "https://github.com/NemoKing1210" }],
    creator: "NemoKing1210",
    publisher: "NemoKing1210",
    metadataBase: new URL("https://github.com/NemoKing1210/ggrun"),
    openGraph: {
      title: t.core.footer.metaTitle,
      description: t.core.footer.metaDescription,
      url: "https://github.com/NemoKing1210/ggrun",
      siteName: "GGRun",
      type: "website",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getT();

  // DB outage → full-screen maintenance state instead of the regular shell.
  if (!(await isDbAvailable())) {
    return (
      <html lang={locale}>
        <body
          className={`${stencil.variable} ${techMono.variable} ${body.variable} antialiased`}
          suppressHydrationWarning
        >
          <SiteUnavailableScreen t={t.core.siteUnavailable} />
        </body>
      </html>
    );
  }

  const user = await getCurrentUser();
  const accent = getAccent(user?.accent);
  const accentCss = accent.primary === "#f2a900"
    ? ""
    : `:root{--hud-amber:${accent.primary};--hud-amber-border:${accent.border};--hud-amber-glow:${accent.glow};}`;
  let maintenanceMode = false;
  try {
    const { getSiteSettings } = await import("@/lib/modules/site-settings/repository/site-settings");
    const s = await getSiteSettings();
    maintenanceMode = !!s.maintenanceMode;
  } catch {}
  const showMaintenanceBanner = maintenanceMode && (!user || user.role !== "admin");
  return (
    <html lang={locale}>
      <body
        className={`${stencil.variable} ${techMono.variable} ${body.variable} antialiased`}
        suppressHydrationWarning
      >
        {accentCss ? <style>{accentCss}</style> : null}
        <I18nProvider locale={locale} t={t}>
          <TopLoader />
          {showMaintenanceBanner && (
            <div className="sticky top-0 z-[60] border-b border-amber/40 bg-amber px-4 py-2 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-black">
              <span className="size-2 bg-black [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] animate-pulse" aria-hidden />
              {t.core.maintenance.text} — {t.core.maintenance.title}
              <span className="hidden sm:inline opacity-70">· login restricted to admins</span>
            </div>
          )}
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
