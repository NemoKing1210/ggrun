import { cookies, headers } from "next/headers";

import {
  LOCALE_COOKIE,
  isLocale,
  negotiateLocale,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";

/** Session locale: user preference → cookie → system Accept-Language → DEFAULT_LOCALE (en). */
export async function getLocale(): Promise<Locale> {
  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (user?.locale && isLocale(user.locale)) return user.locale;
  const jar = await cookies();
  const cookieLocale = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  const headerList = await headers();
  return negotiateLocale(headerList.get("accept-language"));
}


export type T = Dictionary;

/** Dictionary + locale for server components and actions. */
export async function getT(): Promise<{ locale: Locale; t: T }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
