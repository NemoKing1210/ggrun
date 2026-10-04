import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { GameMetaBadges } from "./GameMetaBadges";

const render = (game: Parameters<typeof GameMetaBadges>[0]["game"]) =>
  renderToStaticMarkup(
    <I18nProvider locale="en" t={getDictionary("en")}>
      <GameMetaBadges game={game} />
    </I18nProvider>,
  );

describe("GameMetaBadges", () => {
  it("renders nothing for a missing or empty game", () => {
    expect(render(null)).toBe("");
    expect(render(undefined)).toBe("");
    expect(render({})).toBe("");
  });

  it("shows the year from the release date in UTC", () => {
    expect(render({ releasedAt: "2018-05-10T00:00:00.000Z" })).toContain(">2018<");
  });

  it("shows the Metacritic score, including a legitimate zero", () => {
    expect(render({ metacritic: 92 })).toContain("MC 92");
    expect(render({ metacritic: 0 })).toContain("MC 0");
  });

  it("ignores a NaN Metacritic score", () => {
    expect(render({ metacritic: Number.NaN })).toBe("");
  });

  it("ignores an unparseable release date instead of rendering NaN", () => {
    expect(render({ releasedAt: "not-a-date" })).toBe("");
    expect(render({ releasedAt: "", metacritic: 80 })).toBe(render({ metacritic: 80 }));
  });

  it("never leaks NaN into the badge row", () => {
    const html = render({ releasedAt: "not-a-date", metacritic: 80, rating: 7 });
    expect(html).toContain("MC 80");
    expect(html).not.toContain("NaN");
  });

  it("shows the rating to one decimal, including zero", () => {
    expect(render({ rating: 8.567 })).toContain("8.6");
    expect(render({ rating: 0 })).toContain("0.0");
  });

  it("shows playtime only when it is positive", () => {
    expect(render({ playtimeHours: 12 })).toContain("≈ 12 h");
    expect(render({ playtimeHours: 0 })).toBe("");
    expect(render({ playtimeHours: -3 })).toBe("");
  });

  it("renders all four badges together in year/metacritic/rating/playtime order", () => {
    const html = render({ releasedAt: "2020-01-01T00:00:00.000Z", metacritic: 90, rating: 7.5, playtimeHours: 5 });
    // Icon path data contains digits too, so compare visible text only.
    const text = html.replace(/<svg[\s\S]*?<\/svg>/g, "");
    expect(text.indexOf("2020")).toBeLessThan(text.indexOf("MC 90"));
    expect(text.indexOf("MC 90")).toBeLessThan(text.indexOf("7.5"));
    expect(text.indexOf("7.5")).toBeLessThan(text.indexOf("≈ 5 h"));
  });
});
