import { ART_EFFECT_KEYS, ART_ITEM_KEYS } from "@/components/iee/art-manifest";

export type IeeArtKind = "item" | "effect";

/**
 * Artwork for catalog entries. Shipped in the repo, changed only in the repo —
 * there is no upload in the admin console, because the app container has no
 * persistent volume and anything written to `public/` at runtime would not
 * survive a deploy.
 *
 * ## The naming rule
 *
 *     public/iee/items/<item_key>.webp
 *     public/iee/effects/<effect_key>.webp
 *
 * The file name **is** the catalog key, character for character — `spare_die`
 * is `public/iee/items/spare_die.webp` and nothing else. Keys are already
 * `[a-z0-9_]`, a legal file name everywhere, so there is no transformation to
 * get wrong and no second name to keep in sync. Items and effects have separate
 * folders because their key spaces are separate.
 *
 * ## Adding artwork
 *
 *     1. save the .webp at the path above
 *     2. pnpm iee:art
 *
 * That is the whole procedure. Step 2 regenerates `art-manifest.ts` from the
 * folder; nothing here is edited by hand.
 *
 * ## Why there is a manifest at all
 *
 * The path is *derived* from the key, so it cannot be misspelt. What a derived
 * path cannot do is tell a browser whether the file exists — a component that
 * guessed would render a broken image and a 404 for every entry without art.
 * So the file list is baked in at build time by `scripts/iee-art.ts`, and
 * `IeeArt.test.tsx` fails while the manifest and the folder disagree.
 *
 * This is also the answer to why the old `icon: "/iee/xxx.webp"` field was
 * deleted: a path to a file nobody drew is worse than no field at all. A path
 * generated from the files that are actually there is not that.
 *
 * An entry with no artwork keeps its `heroIcon` glyph, so the catalog is never
 * half-drawn while art is in progress.
 */
export const IEE_ART_KEYS: Record<IeeArtKind, ReadonlySet<string>> = {
  item: new Set(ART_ITEM_KEYS),
  effect: new Set(ART_EFFECT_KEYS),
};

/** Folder under `public/iee/` for a kind. Kept next to the rule it encodes. */
export const IEE_ART_DIR: Record<IeeArtKind, string> = {
  item: "items",
  effect: "effects",
};

/** Public URL of an entry's artwork, or null when it has none yet. */
export function ieeArtSrc(kind: IeeArtKind, key: string | null | undefined): string | null {
  if (!key || !IEE_ART_KEYS[kind].has(key)) return null;
  return `/iee/${IEE_ART_DIR[kind]}/${key}.webp`;
}
