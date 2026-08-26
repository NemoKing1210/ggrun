import { cookies, headers } from "next/headers";

import {
  LOCALE_COOKIE,
  isLocale,
  negotiateLocale,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";

/** Локаль сессии: cookie → Accept-Language системы → DEFAULT_LOCALE (en). */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const cookieLocale = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  const headerList = await headers();
  return negotiateLocale(headerList.get("accept-language"));
}

export type T = Dictionary;

/** Словарь + локаль для серверных компонентов и экшенов. */
export async function getT(): Promise<{ locale: Locale; t: T }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
