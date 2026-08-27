"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { setUserLocale } from "@/lib/use-cases/users";

/** Manual language switch (overrides the system-detected locale). */
export async function setLocaleAction(
  locale: string,
): Promise<void> {
  if (!isLocale(locale)) return;
  await setUserLocale(locale);
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 360 * 24 * 60 * 60,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
