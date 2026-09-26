import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { GameCategoryChips } from "./GameCategoryChips";

const render = (genres: string[], tags: string[], limit?: number) =>
  renderToStaticMarkup(
    <I18nProvider locale="ru" t={getDictionary("ru")}>
      <GameCategoryChips genres={genres} tags={tags} limit={limit} />
    </I18nProvider>,
  );

/** Visible text of every chip, in order. */
const chips = (html: string) => [...html.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);

describe("GameCategoryChips", () => {
  // The report: a survival game in a horror/survival season looked unmatched,
  // because the card showed only "shooter · action".
  it("shows the tags a season may have matched on, not only the genres", () => {
    expect(chips(render(["shooter", "action"], ["survival"]))).toEqual(["Shooter", "Action", "Survival"]);
  });

  it("tells a tag from a genre by colour and title, with no prefix", () => {
    const html = render(["action"], ["horror"]);
    expect(html).toMatch(/title="Жанр"[^>]*text-dim[^>]*>Action</);
    expect(html).toMatch(/title="Тег"[^>]*text-sky-300[^>]*>Horror</);
    expect(html).not.toMatch(/>#/);
    // amber means "selected in the filter" in the season editor
    expect(html).not.toMatch(/amber/);
  });

  it("shows a tag that only repeats a genre once", () => {
    expect(chips(render(["shooter"], ["shooter", "zombie"]))).toEqual(["Shooter", "Zombie"]);
  });

  it("keeps values it has no label for as they are", () => {
    expect(chips(render(["auto-battler"], ["pvp"]))).toEqual(["auto-battler", "pvp"]);
  });

  it("renders nothing for a game with neither", () => {
    expect(render([], [])).toBe("");
  });

  it("caps each group separately", () => {
    const out = chips(render(["action", "rpg", "strategy"], ["horror", "survival", "zombie"], 2));
    expect(out).toEqual(["Action", "RPG", "Horror", "Survival"]);
  });
});
