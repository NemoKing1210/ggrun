import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ieeArtSrc } from "@/components/iee/art";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { IeeIcon, IEE_ICONS, iconSource } from "@/components/iee/IeeIcon";
import type { EntryArt } from "@/lib/engine";
import { IEE_GLYPHS } from "@/lib/engine/iee/dsl";
import { coreRegistry } from "@/lib/modules/iee/registry";

/**
 * This lives in the component layer, not beside the entry tests, because the
 * assertion is about the presentation map. An engine test importing
 * `components/` would invert the layer direction AGENTS.md §2 fixes.
 *
 * Scenarios are the entries themselves — the views the client is given — so a
 * new item or effect is covered the moment it is added.
 */

const ENTRIES = coreRegistry()
  .views()
  .map((v) => [`${v.kind}:${v.key}`, v.glyph ?? "", v.kind] as const);

describe("IeeIcon", () => {
  it("covers every entry (a scan of nothing proves nothing)", () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(14);
  });

  // The map is hand-listed so `optimizePackageImports` can still tree-shake
  // @heroicons; the cost is that a new entry falls back to a generic glyph
  // unless someone adds its icon. This is the test that makes them.
  it.each(ENTRIES)("%s declares a glyph the UI can actually render", (_id, glyph) => {
    expect(IEE_ICONS[glyph], `add ${glyph} to IEE_ICONS in components/iee/IeeIcon.tsx`).toBeDefined();
  });

  it.each(ENTRIES)("%s renders an svg", (_id, glyph, kind) => {
    const html = renderToStaticMarkup(<IeeIcon glyph={glyph} kind={kind} />);
    expect(html).toContain("<svg");
  });

  it("distinguishes the entries rather than stamping one glyph on everything", () => {
    const distinct = new Set(ENTRIES.map(([, glyph]) => glyph));
    expect(distinct.size).toBeGreaterThanOrEqual(8);
  });

  // An unknown key must not leave a hole in a row — a blank cell reads as a
  // rendering bug, while a generic glyph reads as an entry without art yet.
  it.each(["item", "effect"] as const)("falls back to a generic glyph for an unknown %s icon", (kind) => {
    expect(renderToStaticMarkup(<IeeIcon glyph="NoSuchIcon" kind={kind} />)).toContain("<svg");
    expect(renderToStaticMarkup(<IeeIcon glyph={null} kind={kind} />)).toContain("<svg");
  });

  it("gives items and effects different fallbacks", () => {
    const item = renderToStaticMarkup(<IeeIcon glyph={null} kind="item" />);
    const effect = renderToStaticMarkup(<IeeIcon glyph={null} kind="effect" />);
    expect(item).not.toBe(effect);
  });

  // The DSL lets an entry name any glyph in IEE_GLYPHS; the editor offers
  // exactly that list. Both directions, so neither side can grow alone.
  it("renders every glyph the entry documents may name, and no other", () => {
    expect([...IEE_GLYPHS].sort()).toEqual(Object.keys(IEE_ICONS).sort());
  });
});

describe("iconSource — the fallback chain of spec §12", () => {
  const ICON = "/api/files?key=iee_icon%2F2026%2F10%2Fa.webp";
  const PACK = "/api/files?key=iee_icon%2F2026%2F10%2Fp.webp";
  const art = (over: Partial<EntryArt> = {}): EntryArt => ({ iconUrl: null, packIconUrl: null, system: false, ...over });

  it("draws the entry's own icon first, even over the shipped artwork", () => {
    expect(iconSource({ kind: "effect", entryKey: "heavy_boots", glyph: "StarIcon", art: art({ iconUrl: ICON, system: true }) })).toEqual({
      image: ICON,
    });
  });

  it("uses the shipped artwork for the system pack only", () => {
    expect(iconSource({ kind: "effect", entryKey: "heavy_boots", glyph: "StarIcon", art: art({ system: true }) })).toEqual({
      image: ieeArtSrc("effect", "heavy_boots"),
    });
    // Another pack's entry under the same key keeps its own glyph.
    expect(iconSource({ kind: "effect", entryKey: "heavy_boots", glyph: "StarIcon", art: art() })).toEqual({ glyph: "StarIcon" });
  });

  it("puts the entry's glyph before the pack's icon, and the pack's icon before the kind's glyph", () => {
    expect(iconSource({ kind: "item", entryKey: "fan_thing", glyph: "BoltIcon", art: art({ packIconUrl: PACK }) })).toEqual({
      glyph: "BoltIcon",
    });
    expect(iconSource({ kind: "item", entryKey: "fan_thing", glyph: null, art: art({ packIconUrl: PACK }) })).toEqual({ image: PACK });
    // A glyph the map does not know counts as none.
    expect(iconSource({ kind: "item", entryKey: "fan_thing", glyph: "NoSuchIcon", art: art({ packIconUrl: PACK }) })).toEqual({
      image: PACK,
    });
    expect(iconSource({ kind: "item", entryKey: "fan_thing", glyph: null, art: art() })).toEqual({ glyph: null });
  });

  it("draws by key, as before, for a caller that has no art to pass", () => {
    expect(iconSource({ kind: "effect", entryKey: "heavy_boots" })).toEqual({ image: ieeArtSrc("effect", "heavy_boots") });
    expect(iconSource({ kind: "effect", entryKey: "swamp", glyph: "ArrowTrendingDownIcon" })).toEqual({ glyph: "ArrowTrendingDownIcon" });
  });

  it("renders an uploaded icon as an image, in the tile and inline", () => {
    expect(renderToStaticMarkup(<IeeIcon kind="item" glyph={null} art={art({ iconUrl: ICON })} />)).toContain(`src="${ICON.replace(/&/g, "&amp;")}"`);
    expect(renderToStaticMarkup(<IeeArtTile kind="effect" glyph={null} art={art({ packIconUrl: PACK })} />)).toContain("<img");
    expect(renderToStaticMarkup(<IeeArtTile kind="effect" glyph="StarIcon" art={art({ packIconUrl: PACK })} />)).toContain("<svg");
  });
});
