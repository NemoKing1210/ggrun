import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HEX_CLIP, IeeArtTile, SQUARE_CLIP } from "./IeeArtTile";

describe("IeeArtTile", () => {
  it("carries an item as a clipped square, in the amber inventory-slot idiom", () => {
    const html = renderToStaticMarkup(<IeeArtTile kind="item" entryKey="spare_die" />);
    expect(html).toContain(SQUARE_CLIP);
    expect(html).not.toContain(HEX_CLIP);
    expect(html).toContain("border-amber/40 bg-amber/10 text-amber");
  });

  // Items and effects are deliberately different shapes: square is a thing you
  // carry, hex is a state you are in.
  it("carries an effect as a hexagon", () => {
    const html = renderToStaticMarkup(<IeeArtTile kind="effect" entryKey="slowed" />);
    expect(html).toContain(HEX_CLIP);
    expect(html).not.toContain(SQUARE_CLIP);
  });

  it("tints the effect frame by polarity so a debuff reads before the text", () => {
    const bad = renderToStaticMarkup(<IeeArtTile kind="effect" polarity="negative" entryKey="slowed" />);
    expect(bad).toContain("border-danger/60 bg-danger/15 text-danger");
    const good = renderToStaticMarkup(<IeeArtTile kind="effect" polarity="positive" entryKey="shield" />);
    expect(good).toContain("border-military/60 bg-military/15 text-military");
    // An effect with no stated polarity reads as a buff.
    const unset = renderToStaticMarkup(<IeeArtTile kind="effect" entryKey="shield" />);
    expect(unset).toContain("bg-military/15");
  });

  it("prefers shipped artwork when the manifest has it", () => {
    const html = renderToStaticMarkup(<IeeArtTile kind="effect" entryKey="heavy_boots" />);
    expect(html).toContain('src="/iee/effects/heavy_boots.webp"');
    expect(html).toContain("size-full object-cover");
    expect(html).not.toContain("<svg");
  });

  it("falls back to the glyph when there is no artwork", () => {
    const html = renderToStaticMarkup(<IeeArtTile kind="item" entryKey="spare_die" heroIcon="CubeIcon" />);
    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  });

  it("sizes the box and, for a glyph, the icon inside it", () => {
    expect(renderToStaticMarkup(<IeeArtTile kind="item" size="sm" />)).toContain("size-10");
    expect(renderToStaticMarkup(<IeeArtTile kind="item" size="md" />)).toContain("size-14");
    expect(renderToStaticMarkup(<IeeArtTile kind="item" size="lg" />)).toContain("size-24");
    expect(renderToStaticMarkup(<IeeArtTile kind="item" size="lg" />)).toContain('class="size-12"');
    expect(renderToStaticMarkup(<IeeArtTile kind="item" size="sm" />)).toContain('class="size-5"');
  });

  it("stays out of the accessibility tree and forwards an extra class", () => {
    const html = renderToStaticMarkup(<IeeArtTile kind="item" className="opacity-50" />);
    expect(html).toContain("aria-hidden");
    expect(html).toContain("opacity-50");
  });
});
