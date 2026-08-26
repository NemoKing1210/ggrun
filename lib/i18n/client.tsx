"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const I18nContext = createContext<{ locale: Locale; t: Dictionary } | null>(null);

export function I18nProvider({
  locale,
  t,
  children,
}: {
  locale: Locale;
  t: Dictionary;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>
  );
}

/** Доступ к словарю в клиентских компонентах. */
export function useI18n(): { locale: Locale; t: Dictionary } {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n должен вызываться внутри I18nProvider");
  }
  return ctx;
}
