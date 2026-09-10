import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IeeIcon, IEE_ICONS } from "@/components/iee/IeeIcon";
import { listEffects, listItems } from "@/lib/engine";

/**
 * This lives in the component layer, not beside the catalog tests, because the
 * assertion is about the presentation map. An engine test importing
 * `components/` would invert the layer direction AGENTS.md §2 fixes.
 *
 * Scenarios are the catalog itself, so a new item or effect is covered the
 * moment it is added.
 */

const ENTRIES = [
  ...listItems().map((d) => [`item:${d.key}`, d.heroIcon, "item"] as const),
  ...listEffects().map((d) => [`effect:${d.key}`, d.heroIcon, "effect"] as const),
];

describe("IeeIcon", () => {
  it("covers the whole catalog (a scan of nothing proves nothing)", () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(14);
  });

  // The map is hand-listed so `optimizePackageImports` can still tree-shake
  // @heroicons; the cost is that a new entry falls back to a generic glyph
  // unless someone adds its icon. This is the test that makes them.
  it.each(ENTRIES)("%s declares an icon the UI can actually render", (_id, heroIcon) => {
    expect(
      IEE_ICONS[heroIcon],
      `add ${heroIcon} to IEE_ICONS in components/iee/IeeIcon.tsx`,
    ).toBeDefined();
  });

  it.each(ENTRIES)("%s renders an svg", (_id, heroIcon, kind) => {
    const html = renderToStaticMarkup(<IeeIcon heroIcon={heroIcon} kind={kind} />);
    expect(html).toContain("<svg");
  });

  it("distinguishes the catalog rather than stamping one glyph on everything", () => {
    const distinct = new Set(ENTRIES.map(([, heroIcon]) => heroIcon));
    expect(distinct.size).toBeGreaterThanOrEqual(8);
  });

  // An unknown key must not leave a hole in a row — a blank cell reads as a
  // rendering bug, while a generic glyph reads as an entry without art yet.
  it.each(["item", "effect"] as const)("falls back to a generic glyph for an unknown %s icon", (kind) => {
    expect(renderToStaticMarkup(<IeeIcon heroIcon="NoSuchIcon" kind={kind} />)).toContain("<svg");
    expect(renderToStaticMarkup(<IeeIcon heroIcon={null} kind={kind} />)).toContain("<svg");
  });

  it("gives items and effects different fallbacks", () => {
    const item = renderToStaticMarkup(<IeeIcon heroIcon={null} kind="item" />);
    const effect = renderToStaticMarkup(<IeeIcon heroIcon={null} kind="effect" />);
    expect(item).not.toBe(effect);
  });
});
