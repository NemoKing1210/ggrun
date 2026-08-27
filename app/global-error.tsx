"use client";

/**
 * Last-resort error boundary wrapping the whole app tree (active in
 * production builds): catches errors that escape segment boundaries,
 * including failures caused by an unreachable database while a page or
 * layout renders. Renders its own html/body; locale is resolved from the
 * cookie / navigator because the I18nProvider is not mounted here.
 */

import { useEffect } from "react";

import "@/app/globals.css";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

function resolveLocale(): Locale {
  for (const raw of document.cookie.split(";")) {
    const [name, ...rest] = raw.trim().split("=");
    if (name === LOCALE_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      if (isLocale(value)) return value;
    }
  }
  const base = navigator.language?.split("-")[0] ?? "";
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const locale = resolveLocale();
  const t = getDictionary(locale).core.siteUnavailable;

  return (
    <html lang={locale}>
      <body className="antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="hazard-tape mb-6 h-[10px] w-full max-w-lg" aria-hidden />
          <div className="hud-card w-full max-w-lg p-10 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-dim">
              {"// "}
              {t.kicker}
            </p>
            <h1 className="font-display mt-4 text-4xl uppercase tracking-wide text-amber">
              {t.title}
            </h1>
            <p className="mx-auto mt-4 max-w-sm font-mono text-sm leading-relaxed text-dim">
              {t.text}
            </p>
            <button type="button" className="hud-btn mt-8" onClick={reset}>
              {t.retry}
            </button>
          </div>
          <div className="hazard-tape mt-6 h-[10px] w-full max-w-lg" aria-hidden />
        </div>
      </body>
    </html>
  );
}