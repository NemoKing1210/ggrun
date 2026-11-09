import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EffectBadge } from "@/lib/engine";
import { coreRegistry } from "@/lib/modules/iee/registry";

import { EffectBadges } from "./EffectBadges";

/** A badge as the season registry fills it — the name comes with it. */
const badge = (effectKey: string, polarity: EffectBadge["polarity"]): EffectBadge => ({
  effectKey,
  polarity,
  name: coreRegistry().get(effectKey)?.names ?? { ru: "", en: "", uk: "" },
});

describe("EffectBadges", () => {
  it("renders nothing when the player carries no effect", () => {
    expect(renderToStaticMarkup(<EffectBadges badges={[]} locale="en" />)).toBe("");
  });

  it("names a positive effect from its view and tints it military", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("ward", "positive")]} locale="en" />);
    expect(html).toContain('title="Ward"');
    expect(html).toContain(">Ward</span>");
    expect(html).toContain("border-military/50 bg-military/15 text-military");
  });

  it("tints a negative effect danger", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("swamp", "negative")]} locale="en" />);
    expect(html).toContain(">Swamp</span>");
    expect(html).toContain("border-danger/50 bg-danger/15 text-danger");
    expect(html).not.toContain("military");
  });

  it("speaks the reader's language", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("swamp", "negative")]} locale="ru" />);
    expect(html).toContain(">Болото</span>");
  });

  it("falls back to the raw key when the badge carries no name", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("ghost_walk", "negative")]} locale="en" />);
    expect(html).toContain(">ghost_walk</span>");
  });

  it("caps the chips at three by default and counts the rest", () => {
    const html = renderToStaticMarkup(
      <EffectBadges
        badges={[
          badge("ward", "positive"),
          badge("swamp", "negative"),
          badge("lucky", "positive"),
          badge("toll", "negative"),
        ]}
        locale="en"
      />,
    );
    expect(html).toContain(">Ward<");
    expect(html).toContain(">Swamp<");
    expect(html).toContain(">Lucky<");
    expect(html).not.toContain(">Toll<");
    expect(html).toContain(">+1</span>");
    // The overflow chip's tooltip lists the names it hides.
    expect(html).toContain('title="Toll"');
  });

  it("honours an explicit max", () => {
    const html = renderToStaticMarkup(
      <EffectBadges badges={[badge("ward", "positive"), badge("lucky", "positive")]} locale="en" max={1} />,
    );
    expect(html).toContain(">Ward<");
    expect(html).toContain(">+1</span>");
    expect(html).not.toContain(">Lucky<");
  });

  it("omits the overflow chip when nothing is hidden", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("ward", "positive")]} locale="en" />);
    expect(html).not.toContain("+0");
    expect(html.match(/<span /g)?.length).toBe(2); // wrapper + one chip
  });

  it("forwards an extra class onto the wrapper", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("ward", "positive")]} locale="en" className="ml-2" />);
    expect(html).toContain("ml-2");
  });
});
