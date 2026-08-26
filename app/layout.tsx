import type { Metadata } from "next";
import { Big_Shoulders_Stencil, Share_Tech_Mono, Barlow_Condensed } from "next/font/google";

import { getT } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
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
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getT();
  return (
    <html lang={locale}>
      <body
        className={`${stencil.variable} ${techMono.variable} ${body.variable} antialiased`}
      >
        <I18nProvider locale={locale} t={t}>{children}</I18nProvider>
      </body>
    </html>
  );
}
