import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/lib/i18n/dictionaries";
import type { EffectBadge } from "@/lib/engine";

import { EffectBadges } from "./EffectBadges";

const t = getDictionary("en");

const badge = (effectKey: string, polarity: EffectBadge["polarity"]): EffectBadge => ({ effectKey, polarity });

describe("EffectBadges", () => {
  it("renders nothing when the player carries no effect", () => {
    expect(renderToStaticMarkup(<EffectBadges badges={[]} t={t} />)).toBe("");
  });

  it("names a positive effect from the dictionary and tints it military", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("shield", "positive")]} t={t} />);
    expect(html).toContain('title="Shield"');
    expect(html).toContain(">Shield</span>");
    expect(html).toContain("border-military/50 bg-military/15 text-military");
  });

  it("tints a negative effect danger", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("slowed", "negative")]} t={t} />);
    expect(html).toContain(">Slowed</span>");
    expect(html).toContain("border-danger/50 bg-danger/15 text-danger");
    expect(html).not.toContain("military");
  });

  it("falls back to the raw key when the effect is unknown", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("ghost_walk", "negative")]} t={t} />);
    expect(html).toContain(">ghost_walk</span>");
  });

  it("caps the chips at three by default and counts the rest", () => {
    const html = renderToStaticMarkup(
      <EffectBadges
        badges={[
          badge("shield", "positive"),
          badge("slowed", "negative"),
          badge("lucky", "positive"),
          badge("taxed", "negative"),
        ]}
        t={t}
      />,
    );
    expect(html).toContain(">Shield<");
    expect(html).toContain(">Slowed<");
    expect(html).toContain(">Lucky<");
    expect(html).not.toContain(">Taxed<");
    expect(html).toContain(">+1</span>");
    // The overflow chip's tooltip lists the names it hides.
    expect(html).toContain('title="Taxed"');
  });

  it("honours an explicit max", () => {
    const html = renderToStaticMarkup(
      <EffectBadges badges={[badge("shield", "positive"), badge("lucky", "positive")]} t={t} max={1} />,
    );
    expect(html).toContain(">Shield<");
    expect(html).toContain(">+1</span>");
    expect(html).not.toContain(">Lucky<");
  });

  it("omits the overflow chip when nothing is hidden", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("shield", "positive")]} t={t} />);
    expect(html).not.toContain("+0");
    expect(html.match(/<span /g)?.length).toBe(2); // wrapper + one chip
  });

  it("forwards an extra class onto the wrapper", () => {
    const html = renderToStaticMarkup(<EffectBadges badges={[badge("shield", "positive")]} t={t} className="ml-2" />);
    expect(html).toContain("ml-2");
  });
});
