import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IEE_ART_DIR, IEE_ART_KEYS, ieeArtSrc, type IeeArtKind } from "@/components/iee/art";
import { IeeIcon } from "@/components/iee/IeeIcon";
import { listEffects, listItems } from "@/lib/engine";
import { renderManifest, scanArtKeys } from "@/scripts/iee-art";

/**
 * The naming rule, enforced in both directions.
 *
 * The manifest alone would let a key survive after its file was deleted; a
 * folder scan alone would let a file be dropped in that no component can ever
 * reach, because the browser only ever sees the manifest. Checking one against
 * the other is what makes "the file name is the key" a rule rather than a note
 * in a doc — and it is what tells you to run `pnpm iee:art` instead of leaving
 * you to wonder why your artwork does not show up.
 */

const KINDS: IeeArtKind[] = ["item", "effect"];
const ROOT = path.join(process.cwd(), "public", "iee");
const KEY_RE = /^[a-z0-9_]+$/;

/**
 * An icon, not a wallpaper. The byte cap alone is not enough: a flat 2048px
 * graphic compresses to a few KB and would sail through it while still costing
 * a full-resolution decode for something drawn at 16-24 CSS px. The mutation
 * run that found this is why both limits are here.
 */
const MAX_BYTES = 24 * 1024;
const MAX_SIDE = 512;
const RECOMMENDED_SIDE = 128;

const catalogKeys: Record<IeeArtKind, Set<string>> = {
  item: new Set(listItems().map((d) => d.key)),
  effect: new Set(listEffects().map((d) => d.key)),
};

function dirFor(kind: IeeArtKind) {
  return path.join(ROOT, IEE_ART_DIR[kind]);
}

function filesIn(kind: IeeArtKind): string[] {
  const dir = dirFor(kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => !f.startsWith(".") && f !== "README.md");
}

/** Width/height straight out of the WebP container — no image library needed. */
function webpSize(file: string): { width: number; height: number } | null {
  const b = fs.readFileSync(file);
  if (b.length < 30) return null;
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1,
      height: (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1,
    };
  }
  if (chunk === "VP8 ") {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

describe("IEE artwork — the registry and the folder must agree", () => {
  it.each(KINDS)("every registered %s key is a real catalog entry", (kind) => {
    const strays = [...IEE_ART_KEYS[kind]].filter((k) => !catalogKeys[kind].has(k));
    expect(strays, `not in the ${kind} catalog`).toEqual([]);
  });

  it.each(KINDS)("every registered %s key has its file", (kind) => {
    const missing = [...IEE_ART_KEYS[kind]].filter(
      (k) => !fs.existsSync(path.join(dirFor(kind), `${k}.webp`)),
    );
    expect(
      missing.map((k) => `public/iee/${IEE_ART_DIR[kind]}/${k}.webp`),
      "in the manifest but the file is not there — delete the file, or run `pnpm iee:art`",
    ).toEqual([]);
  });

  it.each(KINDS)("every file in the %s folder is reachable by the app", (kind) => {
    const unreachable = filesIn(kind)
      .map((f) => f.replace(/\.webp$/, ""))
      .filter((k) => !IEE_ART_KEYS[kind].has(k));
    expect(
      unreachable,
      "artwork the app cannot see — run `pnpm iee:art` to regenerate the manifest",
    ).toEqual([]);
  });

  /**
   * The two tests above compare the manifest to the folder key by key. This one
   * compares the whole generated file byte for byte, so formatting drift or a
   * hand edit is caught too — the same shape as `scenarios:doc`, which is the
   * repo's existing generated-artifact convention.
   */
  it("has a manifest that is not stale", () => {
    const expected = renderManifest(scanArtKeys("items"), scanArtKeys("effects"));
    const actual = fs.readFileSync(
      path.join(process.cwd(), "components", "iee", "art-manifest.ts"),
      "utf8",
    );
    expect(actual, "components/iee/art-manifest.ts is out of date — run `pnpm iee:art`").toBe(
      expected,
    );
  });
});

describe("IEE artwork — the naming rule", () => {
  it.each(KINDS)("%s files are lowercase .webp named after their key", (kind) => {
    const bad = filesIn(kind).filter((f) => !f.endsWith(".webp") || !KEY_RE.test(f.slice(0, -5)));
    expect(bad, "expected <key>.webp with key matching [a-z0-9_]").toEqual([]);
  });

  it.each(KINDS)("%s files are square webp within the size budget", (kind) => {
    const problems: string[] = [];
    for (const f of filesIn(kind)) {
      const full = path.join(dirFor(kind), f);
      const bytes = fs.statSync(full).size;
      if (bytes > MAX_BYTES) problems.push(`${f}: ${Math.round(bytes / 1024)}KB > ${MAX_BYTES / 1024}KB`);
      const size = webpSize(full);
      if (!size) problems.push(`${f}: not a readable WebP (is it a renamed PNG?)`);
      else if (size.width !== size.height) problems.push(`${f}: ${size.width}x${size.height} is not square`);
      else if (size.width > MAX_SIDE)
        problems.push(
          `${f}: ${size.width}px exceeds ${MAX_SIDE}px (${RECOMMENDED_SIDE}px is the target — this renders at icon size)`,
        );
    }
    expect(problems).toEqual([]);
  });

  it("derives the path from the key rather than storing it", () => {
    for (const kind of KINDS) {
      for (const key of IEE_ART_KEYS[kind]) {
        expect(ieeArtSrc(kind, key)).toBe(`/iee/${IEE_ART_DIR[kind]}/${key}.webp`);
      }
    }
  });

  it("returns null for an entry with no artwork, so the glyph is used", () => {
    expect(ieeArtSrc("item", "definitely_not_registered")).toBeNull();
    expect(ieeArtSrc("item", null)).toBeNull();
    expect(ieeArtSrc("item", undefined)).toBeNull();
  });
});

describe("IeeIcon — art wins, glyph covers", () => {
  it("renders the glyph for an entry with no artwork", () => {
    const html = renderToStaticMarkup(
      <IeeIcon heroIcon="BeakerIcon" kind="item" entryKey="definitely_not_registered" />,
    );
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });

  it("renders the glyph when no key is passed at all", () => {
    expect(renderToStaticMarkup(<IeeIcon heroIcon="BoltIcon" kind="effect" />)).toContain("<svg");
  });

  /**
   * Over the whole catalog rather than over the registered keys, so this can
   * never go vacuous: with no artwork yet it asserts all 14 entries fall back
   * to a glyph, and as art lands it asserts those entries switch to an <img>
   * pointing at the derived path. There is no state in which it tests nothing.
   */
  const ALL = [
    ...listItems().map((d) => ["item", d.key, d.heroIcon] as const),
    ...listEffects().map((d) => ["effect", d.key, d.heroIcon] as const),
  ];

  it("covers every catalog entry", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(14);
  });

  it.each(ALL)("%s %s renders art when it has some, its glyph when it does not", (kind, key, heroIcon) => {
    const html = renderToStaticMarkup(<IeeIcon heroIcon={heroIcon} kind={kind} entryKey={key} />);
    if (IEE_ART_KEYS[kind].has(key)) {
      expect(html).toContain(`/iee/${IEE_ART_DIR[kind]}/${key}.webp`);
      expect(html).toContain("<img");
    } else {
      expect(html).toContain("<svg");
      expect(html).not.toContain("<img");
    }
  });
});
