import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/infrastructure/db";
import { users } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";
import { AdminError } from "@/lib/modules/season/service/errors";
import {
  deleteFileByUrl,
  fileKeyFromUrl,
  fileUrl,
  storeFile,
  type FileActor,
} from "@/lib/modules/files/service";
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

/**
 * Inline images are the wire format for a freshly cropped picture: the editor
 * crops in the browser and submits a data URL, which the service then stores as
 * a file. The cap only stops a hostile client from posting a huge string — the
 * byte limit that matters is the category's, enforced by `storeFile`.
 *
 * `z.string().url()` is deliberately NOT the first branch: it accepts `data:`
 * and `javascript:` URLs, so a capped `data:` match must win before it.
 */
const INLINE_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/;
const MAX_INLINE_CHARS = 700_000;

/** Our own app URL (`/api/files?key=…`) — relative on purpose, so rows stay portable. */
const storedFileUrlSchema = z
  .string()
  .refine((value) => fileKeyFromUrl(value) !== null, { message: "Not a known file link" });

/** A picture hosted somewhere else. */
const externalImageUrlSchema = z
  .string()
  .refine((value) => /^https?:\/\/\S+$/i.test(value), { message: "Must be an http(s) URL" });

const profileImageSchema = z.union([
  z.string().max(MAX_INLINE_CHARS).regex(INLINE_IMAGE_RE),
  storedFileUrlSchema,
  externalImageUrlSchema,
  z.literal(""),
]);

export const updateUserSettingsSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(MAX_BIO_LENGTH),
  avatarUrl: profileImageSchema.optional(),
  bannerUrl: profileImageSchema.optional(),
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

type ProfileImage = "avatar" | "banner";

/** Best-effort removal of the picture a field is being moved away from. */
async function dropPrevious(url: string | null, actor: FileActor): Promise<void> {
  if (!url) return;
  try {
    await deleteFileByUrl(url, actor);
  } catch (e) {
    // A stale or foreign URL must not block the save.
    log.warn("user.settings.image_drop_failed", { actorId: actor?.id ?? null, err: e });
  }
}

/**
 * Resolves one image field of the profile form.
 *
 * - `undefined` → the field was not submitted; leave the column untouched.
 * - `""` → the user removed the picture; drop the stored file.
 * - a `data:` URL → store the bytes as a proper file, then drop the previous one.
 * - anything else → an external or already-stored URL; keep it as-is.
 */
async function resolveProfileImage(opts: {
  category: ProfileImage;
  previous: string | null;
  requested: string | undefined;
  actor: FileActor;
}): Promise<string | null | undefined> {
  const { category, previous, requested, actor } = opts;
  if (requested === undefined) return undefined;

  const inline = INLINE_IMAGE_RE.test(requested);
  if (inline) {
    const payload = requested.slice(requested.indexOf(",") + 1).replace(/\s/g, "");
    const bytes = new Uint8Array(Buffer.from(payload, "base64"));
    const row = await storeFile({ category, data: bytes, actor });
    await dropPrevious(previous, actor);
    return fileUrl(row);
  }

  if (requested === "") {
    await dropPrevious(previous, actor);
    return null;
  }

  if (requested !== previous) await dropPrevious(previous, actor);
  return requested;
}

export async function updateUserSettings(input: unknown): Promise<void> {
  const user = await requireLogin();
  const data = updateUserSettingsSchema.parse(input);
  const actor = { id: user.id, role: user.role };

  const avatarUrl = await resolveProfileImage({
    category: "avatar",
    previous: user.avatarUrl,
    requested: data.avatarUrl,
    actor,
  });
  const bannerUrl = await resolveProfileImage({
    category: "banner",
    previous: user.bannerUrl,
    requested: data.bannerUrl,
    actor,
  });

  await db
    .update(users)
    .set({
      displayName: data.displayName,
      bio: data.bio || null,
      avatarUrl,
      bannerUrl,
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
