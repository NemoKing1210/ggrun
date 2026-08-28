import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/infrastructure/db";
import { users } from "@/db/schema";
import { AdminError } from "@/lib/modules/season/service/errors";
import { MAX_BIO_LENGTH } from "@/lib/shared/constants/profile";
import { ACCENT_KEYS, type AccentKey } from "@/lib/shared/ui/accent";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n/config";
import { NETWORKS, isValidUrlForNetwork, type Network } from "@/lib/shared/ui/networks";

export type { Network };

export const userLinksSchema = z
  .array(
    z
      .object({ network: z.enum(NETWORKS), url: z.string().url().max(500) })
      .superRefine((val, ctx) => {
        if (!isValidUrlForNetwork(val.network as Network, val.url)) {
          ctx.addIssue({ code: "custom", path: ["url"], message: `URL must be a ${val.network} link` });
        }
      }),
  )
  .max(6);

export const updateUserSettingsSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(MAX_BIO_LENGTH),
  avatarUrl: z.union([z.string().url(), z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/).max(300_000), z.literal("")]).optional(),
  bannerUrl: z.union([z.string().url(), z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/).max(500_000), z.literal("")]).optional(),
  accent: z.enum(ACCENT_KEYS),
  locale: z.enum(LOCALES),
  links: userLinksSchema,
});

async function requireLogin() {
  const { getCurrentUser } = await import("@/lib/infrastructure/auth/session");
  const user = await getCurrentUser();
  if (!user) throw new AdminError("authLoginRequired");
  return user;
}

export async function updateUserSettings(input: unknown): Promise<void> {
  const user = await requireLogin();
  const data = updateUserSettingsSchema.parse(input);
  await db
    .update(users)
    .set({
      displayName: data.displayName,
      bio: data.bio || null,
      avatarUrl: data.avatarUrl === undefined ? undefined : data.avatarUrl || null,
      bannerUrl: data.bannerUrl === undefined ? undefined : data.bannerUrl || null,
      accent: data.accent as AccentKey,
      locale: data.locale as Locale,
      links: data.links as unknown as Record<string, unknown>[],
    })
    .where(eq(users.id, user.id));
}

export async function setUserLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const { getCurrentUser } = await import("@/lib/infrastructure/auth/session");
  const user = await getCurrentUser();
  if (!user) return;
  await db.update(users).set({ locale: locale as Locale }).where(eq(users.id, user.id));
}
