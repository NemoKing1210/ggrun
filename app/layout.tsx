import type { Metadata } from "next";
import { Big_Shoulders_Stencil, Share_Tech_Mono, Barlow_Condensed } from "next/font/google";

import { getT } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { TopLoader } from "@/components/ui/top-loader";
import { PageTransition } from "@/components/ui/PageTransition";
import { getCurrentUser } from "@/lib/auth/session";
import { getAccent } from "@/lib/accent";
import { isDbAvailable } from "@/lib/db-health";
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
  return (
    <html lang={locale}>
      <body
        className={`${stencil.variable} ${techMono.variable} ${body.variable} antialiased`}
        suppressHydrationWarning
      >
        {accentCss ? <style>{accentCss}</style> : null}
        <I18nProvider locale={locale} t={t}>
          <TopLoader />
          <PageTransition>{children}</PageTransition>
        </I18nProvider>
      </body>
    </html>
  );
}
