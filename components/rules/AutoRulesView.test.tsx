import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Season } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from "@/lib/engine";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { AutoRulesView } from "./AutoRulesView";

const season: Season = {
  id: "s1",
  slug: "run-1",
  title: "Run One",
  status: "active",
  config: {},
  rulesMd: null,
  startedAt: null,
  finishedAt: null,
  createdBy: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
};

const config = (points: Partial<SeasonConfig["points"]>, dropStreakMultiplier = true): SeasonConfig => ({
  ...DEFAULT_SEASON_CONFIG,
  dice: { ...DEFAULT_SEASON_CONFIG.dice, dropStreakMultiplier },
  points: { ...DEFAULT_SEASON_CONFIG.points, ...points },
});

const render = (cfg: SeasonConfig, locale: Locale = "en") => {
  const t = getDictionary(locale);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} t={t}>
      <AutoRulesView season={season} config={cfg} t={t} locale={locale} entries={{}} pool={{}} />
    </I18nProvider>,
  );
};

/**
 * Points ride on the move both ways — a pass goes further forward, a drop
 * further back (`resolveMovement`). The page used to promise the forward half
 * only (owner's call, 2026-10-09: keep the rule, tell it right).
 */
describe("AutoRulesView — points and movement", () => {
  it("says points lengthen the move both ways, and are spent when the season spends them", () => {
    const html = render(config({ bonusAddsToRollOnPass: true, resetBalanceAfterUse: true }));
    expect(html).toContain("pass → + dice + pts");
    expect(html).toContain("drop → − dice × (streak + 1) − pts");
    expect(html).toContain("Drops in a row multiply the step back: dice sum × (drops in a row + 1).");
    expect(html).toContain("Points add to the step both ways: further forward on a pass, further back on a drop.");
    expect(html).toContain("points ride on your next move and are spent on it");
    expect(html).toContain("spent on the move");
    expect(html).not.toMatch(/augments|no bonus|retain/);
  });

  it("points the season keeps ride on every move", () => {
    const html = render(config({ bonusAddsToRollOnPass: true, resetBalanceAfterUse: false }));
    expect(html).toContain("points ride on every move and stay");
    expect(html).toContain(">kept<");
  });

  it("without the rule, points move nobody and the formulas say so", () => {
    const html = render(config({ bonusAddsToRollOnPass: false, resetBalanceAfterUse: true }, false));
    expect(html).toContain(">pass → + dice<");
    expect(html).toContain(">drop → − dice<");
    expect(html).toContain("A drop moves back by the dice sum; drops in a row do not add up.");
    expect(html).toContain("points do not change your moves");
    expect(html).not.toContain("pts<");
    expect(html).not.toContain("spent on the move");
  });

  it("speaks the reader's language", () => {
    const html = render(config({ bonusAddsToRollOnPass: true, resetBalanceAfterUse: true }), "ru");
    expect(html).toContain("дроп → − кубики × (серия + 1) − очки");
    expect(html).toContain("Очки прибавляются к шагу в обе стороны: на пасе — дальше вперёд, на дропе — дальше назад.");
    expect(html).toContain("очки идут в следующий ход и сгорают на нём");
  });
});
