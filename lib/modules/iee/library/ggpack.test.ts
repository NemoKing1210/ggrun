import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, CORE_REVISIONS } from "@/lib/engine/iee/core-docs";
import { writeZip } from "@/lib/infrastructure/zip";

import {
  decodeGgpack,
  encodeGgpack,
  GgpackError,
  manifestContent,
  MANIFEST_NAME,
  revisionIdFor,
  stableJson,
  type GgpackManifest,
} from "./ggpack";
import { contentHash } from "./publish";

const PACK_ID = "11111111-2222-4333-8444-555555555555";

function manifest(over: Partial<GgpackManifest> = {}): GgpackManifest {
  const salve = CORE_DOCS.find((d) => d.doc.slug === "cleansing_salve")!;
  return {
    format: "ggpack",
    formatVersion: 1,
    exportedAt: "2026-10-01T12:00:00.000Z",
    dslVersion: 1,
    pack: {
      id: PACK_ID,
      slug: "spooky",
      names: { ru: "Жуть", en: "Spooky" },
      defaultLocale: "ru",
      capabilities: [],
      minDslVersion: 1,
      dependencies: [],
    },
    entries: [
      {
        id: salve.entryId,
        slug: "cleansing_salve",
        kind: "item",
        revisions: [{ number: 1, contentHash: contentHash(salve.doc), doc: salve.doc }],
      },
    ],
    ...over,
  };
}

const zipOf = (files: Record<string, string | Uint8Array>) =>
  writeZip(
    Object.entries(files).map(([name, data]) => ({
      name,
      data: typeof data === "string" ? new TextEncoder().encode(data) : data,
    })),
  );

const refusal = (bytes: Uint8Array) => {
  try {
    decodeGgpack(bytes);
  } catch (e) {
    expect(e).toBeInstanceOf(GgpackError);
    return (e as Error).message;
  }
  throw new Error("decoded");
};

describe("ggpack — encoding", () => {
  it("round-trips the manifest and the icons it names", () => {
    const icon = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);
    const m = manifest({ pack: { ...manifest().pack, icon: "icons/pack.webp" } });
    m.entries[0]!.icon = "icons/salve.png";
    const icons = new Map([
      ["icons/pack.webp", icon],
      ["icons/salve.png", new Uint8Array([9, 9])],
    ]);
    const decoded = decodeGgpack(encodeGgpack(m, icons));
    expect(decoded.manifest).toEqual(m);
    expect([...decoded.icons.keys()].sort()).toEqual(["icons/pack.webp", "icons/salve.png"]);
    expect(decoded.icons.get("icons/pack.webp")).toEqual(icon);
  });

  it("is deterministic: the same content gives the same bytes, whatever the key order", () => {
    const reversed = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reversed);
      if (value === null || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)]));
    };
    const a = manifest();
    const shuffled = reversed(a) as GgpackManifest;
    expect(Object.keys(shuffled)[0]).not.toBe(Object.keys(a)[0]);
    expect(shuffled).toEqual(a);
    expect(encodeGgpack(shuffled)).toEqual(encodeGgpack(a));
    expect(encodeGgpack(a)).toEqual(encodeGgpack(manifest()));
  });

  it("writes the manifest as sorted, indented JSON, readable in a diff", () => {
    expect(stableJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{\n  "a": {\n    "c": null,\n    "d": [\n      2,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n',
    );
  });

  it("refuses to write a pack that names an icon it does not carry", () => {
    const m = manifest();
    m.entries[0]!.icon = "icons/salve.webp";
    expect(() => encodeGgpack(m)).toThrow(GgpackError);
    expect(() => encodeGgpack(m)).toThrow("icons/salve.webp");
  });

  it("refuses to write a manifest that breaks the format", () => {
    expect(() => encodeGgpack({ ...manifest(), formatVersion: 2 } as never)).toThrow();
  });
});

describe("ggpack — decoding refuses what is not a pack, saying why", () => {
  it("not a zip", () => {
    expect(refusal(new TextEncoder().encode("hello, world"))).toBe("not a zip archive");
  });

  it("a zip without a manifest", () => {
    expect(refusal(zipOf({ "readme.txt": "hi" }))).toBe("manifest.json is missing");
  });

  it("a manifest that is not JSON, or not UTF-8", () => {
    expect(refusal(zipOf({ [MANIFEST_NAME]: "{nope" }))).toBe("manifest.json is not valid JSON");
    expect(refusal(zipOf({ [MANIFEST_NAME]: new Uint8Array([0x7b, 0xff, 0x7d]) }))).toBe("manifest.json is not valid JSON");
  });

  it.each([
    ["another format", { format: "zip" }, "format"],
    ["a future format version", { formatVersion: 2 }, "formatVersion"],
    ["an unknown field", { extra: true }, "(root)"],
    ["a bad export time", { exportedAt: "yesterday" }, "exportedAt"],
  ])("%s", (_label, patch, where) => {
    expect(refusal(zipOf({ [MANIFEST_NAME]: JSON.stringify({ ...manifest(), ...patch }) }))).toContain(where);
  });

  it.each([
    ["an uppercase slug", { slug: "Spooky" }, "pack.slug"],
    ["an id that is not a uuid", { id: "core" }, "pack.id"],
    ["an icon outside icons/", { icon: "../evil.webp" }, "pack.icon"],
    ["an icon of another type", { icon: "icons/pack.svg" }, "pack.icon"],
  ])("a pack with %s", (_label, patch, where) => {
    const m = { ...manifest(), pack: { ...manifest().pack, ...patch } };
    expect(refusal(zipOf({ [MANIFEST_NAME]: JSON.stringify(m) }))).toContain(where);
  });

  it("an entry without revisions, or with a malformed hash", () => {
    const empty = manifest();
    empty.entries[0]!.revisions = [];
    expect(refusal(zipOf({ [MANIFEST_NAME]: JSON.stringify(empty) }))).toContain("entries.0.revisions");
    const badHash = manifest();
    badHash.entries[0]!.revisions[0]!.contentHash = "abc";
    expect(refusal(zipOf({ [MANIFEST_NAME]: JSON.stringify(badHash) }))).toContain("entries.0.revisions.0.contentHash");
  });

  it("an icon the manifest names but the archive lacks", () => {
    const m = manifest();
    m.entries[0]!.icon = "icons/salve.webp";
    expect(refusal(zipOf({ [MANIFEST_NAME]: JSON.stringify(m) }))).toBe("icon icons/salve.webp is named but missing");
  });

  it("ignores files the manifest does not name", () => {
    const decoded = decodeGgpack(zipOf({ [MANIFEST_NAME]: JSON.stringify(manifest()), "icons/stray.webp": "x" }));
    expect(decoded.icons.size).toBe(0);
  });
});

describe("ggpack — what 'the same pack' means", () => {
  it("compares manifests without their export time", () => {
    const later = manifest({ exportedAt: "2027-01-01T00:00:00.000Z" });
    expect(later).not.toEqual(manifest());
    expect(manifestContent(later)).toEqual(manifestContent(manifest()));
    expect(manifestContent(later)).not.toHaveProperty("exportedAt");
  });
});

describe("revision ids", () => {
  it("are UUID v5 of the entry and the content hash — the same on every installation", () => {
    const id = revisionIdFor("00000000-0000-4000-8000-000000000001", "a".repeat(64));
    // Python: uuid.uuid5(UUID("3f9a6c2e-8b41-4d7a-9e5c-1b2d4f6a8c0e"), "<entry>/<hash>")
    expect(id).toBe("95184d74-ce47-5dea-b039-00f29dd3797a");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("match the ids the core fixture was generated with", () => {
    const salve = CORE_REVISIONS.cleansing_salve;
    expect(revisionIdFor(CORE_ENTRY_IDS.cleansing_salve, salve.contentHash)).toBe("c80d76e9-27ff-5a6e-84cd-26525ec07013");
    for (const record of CORE_DOCS) {
      expect(revisionIdFor(record.entryId, contentHash(record.doc))).toBe(record.revisionId);
    }
  });

  it("differ by entry and by content, and ignore the case of the entry id", () => {
    const hash = "b".repeat(64);
    const a = revisionIdFor(PACK_ID, hash);
    expect(revisionIdFor(PACK_ID.toUpperCase(), hash)).toBe(a);
    expect(revisionIdFor("11111111-2222-4333-8444-555555555556", hash)).not.toBe(a);
    expect(revisionIdFor(PACK_ID, "c".repeat(64))).not.toBe(a);
  });
});
