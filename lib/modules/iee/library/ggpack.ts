/**
 * The `.ggpack` file (docs/IEE_CONSTRUCTOR_SPEC.md §11): a zip with
 * `manifest.json` and the icons it names.
 *
 * Encoding is deterministic — sorted keys, fixed zip timestamps — so a pack
 * committed to the repository (`seed/iee/core.ggpack`) only changes when its
 * content does. Decoding checks the frame and the icon paths; the documents
 * inside are checked by the import, with the publish checks (§14).
 */
import { createHash } from "node:crypto";
import { z } from "zod";

import { canonicalJson, LIMITS, LOCALES, LocalizedSchema, SLUG_RE } from "@/lib/engine/iee/dsl";
import { readZip, writeZip, ZipError, type ZipFile } from "@/lib/infrastructure/zip";

export const GGPACK_FORMAT_VERSION = 1 as const;
export const MANIFEST_NAME = "manifest.json";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "a lowercase uuid");
const Slug = z.string().regex(SLUG_RE);
/** An icon is a file under `icons/`, PNG or WebP. */
const IconPath = z.string().regex(/^icons\/[a-z0-9_]{1,48}\.(webp|png)$/, "icons/<name>.webp or .png");

export const GgpackRevisionSchema = z.strictObject({
  number: z.number().int().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** An entry document; the import checks it like a publish does. */
  doc: z.unknown(),
});

export const GgpackEntrySchema = z.strictObject({
  id: Uuid,
  slug: Slug,
  kind: z.enum(["item", "effect"]),
  icon: IconPath.optional(),
  revisions: z.array(GgpackRevisionSchema).min(1).max(500),
});

export const GgpackManifestSchema = z.strictObject({
  format: z.literal("ggpack"),
  formatVersion: z.literal(GGPACK_FORMAT_VERSION),
  exportedAt: z.string().datetime(),
  dslVersion: z.number().int().min(1),
  pack: z.strictObject({
    id: Uuid,
    slug: Slug,
    names: LocalizedSchema(LIMITS.nameLength),
    description: LocalizedSchema(LIMITS.flavorLength).optional(),
    defaultLocale: z.enum(LOCALES),
    capabilities: z.array(z.string().regex(/^[a-z0-9_]{1,48}$/)).max(32),
    minDslVersion: z.number().int().min(1),
    dependencies: z.array(z.strictObject({ id: Uuid, slug: Slug })).max(64),
    icon: IconPath.optional(),
  }),
  entries: z.array(GgpackEntrySchema).max(1000),
});
export type GgpackManifest = z.infer<typeof GgpackManifestSchema>;
export type GgpackEntry = z.infer<typeof GgpackEntrySchema>;

export class GgpackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GgpackError";
  }
}

/** JSON with sorted keys and two-space indentation: stable, and readable in a diff. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;
}

/** A pack as bytes: the manifest and the icons it names. */
export function encodeGgpack(manifest: GgpackManifest, icons: ReadonlyMap<string, Uint8Array> = new Map()): Uint8Array {
  const parsed = GgpackManifestSchema.parse(manifest);
  const named = iconPaths(parsed);
  for (const path of named) if (!icons.has(path)) throw new GgpackError(`icon ${path} is named but missing`);
  const files: ZipFile[] = [{ name: MANIFEST_NAME, data: new TextEncoder().encode(stableJson(parsed)) }];
  for (const path of [...named].sort()) files.push({ name: path, data: icons.get(path)! });
  return writeZip(files);
}

function iconPaths(manifest: GgpackManifest): Set<string> {
  const paths = new Set<string>();
  if (manifest.pack.icon) paths.add(manifest.pack.icon);
  for (const e of manifest.entries) if (e.icon) paths.add(e.icon);
  return paths;
}

export interface DecodedGgpack {
  manifest: GgpackManifest;
  icons: Map<string, Uint8Array>;
}

/** Reads a pack, refusing anything that is not one — with a message an admin can act on. */
export function decodeGgpack(bytes: Uint8Array): DecodedGgpack {
  let files: ZipFile[];
  try {
    files = readZip(bytes);
  } catch (e) {
    throw new GgpackError(e instanceof ZipError ? e.message : "not a zip archive");
  }
  const manifestFile = files.find((f) => f.name === MANIFEST_NAME);
  if (!manifestFile) throw new GgpackError("manifest.json is missing");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestFile.data));
  } catch {
    throw new GgpackError("manifest.json is not valid JSON");
  }
  const parsed = GgpackManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    throw new GgpackError(`manifest.json: ${first.path.join(".") || "(root)"} — ${first.message}`);
  }
  const icons = new Map<string, Uint8Array>();
  for (const path of iconPaths(parsed.data)) {
    const file = files.find((f) => f.name === path);
    if (!file) throw new GgpackError(`icon ${path} is named but missing`);
    icons.set(path, file.data);
  }
  return { manifest: parsed.data, icons };
}

/** The manifest without its export time — what "the same pack" means when comparing exports. */
export function manifestContent(manifest: GgpackManifest): Omit<GgpackManifest, "exportedAt"> {
  const { exportedAt: _exportedAt, ...rest } = manifest;
  return rest;
}

// ---------------------------------------------------------------------------
// Revision ids
// ---------------------------------------------------------------------------

/** Namespace of the revision ids below (a fixed, random v4). */
const REVISION_NAMESPACE = "3f9a6c2e-8b41-4d7a-9e5c-1b2d4f6a8c0e";

/**
 * The id of the revision of `entryId` with this content: a UUID v5 of the two.
 * A pack file does not carry revision ids, so the same content imported into
 * any installation — or published again — gets the same id, and a season's
 * pins and the journal read the same everywhere.
 */
export function revisionIdFor(entryId: string, contentHash: string): string {
  const ns = Buffer.from(REVISION_NAMESPACE.replace(/-/g, ""), "hex");
  const digest = createHash("sha1").update(ns).update(`${entryId.toLowerCase()}/${contentHash}`, "utf8").digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
