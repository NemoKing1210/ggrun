import { describe, expect, it } from "vitest";

import { GENRES, TAGS } from "./constants";
import { GAME_POOL_TEMPLATES, getTemplate } from "./templates";
import {
  F2G_GENRE_CATEGORIES,
  F2G_KNOWN_CATEGORIES,
  F2G_MAX_QUERIES,
  F2G_TAG_CATEGORIES,
  f2gFilterSupport,
  f2gMainGenre,
  mergeF2gResults,
  planF2gQueries,
} from "./freetogame-taxonomy";

const rng = () => 0.42;
const TEMPLATE_IDS = GAME_POOL_TEMPLATES.map((t) => t.id);
const filters = (genres: string[], tags: string[], platforms: string[] = []) => ({ genres, tags, platforms });

describe("the FreeToGame category map", () => {
  // `/filter` silently ignores a category it does not know, so a typo here
  // would not fail loudly — it would quietly widen every request.
  it("only ever asks FreeToGame for categories it has", () => {
    const known = new Set<string>(F2G_KNOWN_CATEGORIES);
    for (const map of [F2G_GENRE_CATEGORIES, F2G_TAG_CATEGORIES]) {
      for (const [ours, cats] of Object.entries(map)) {
        for (const c of cats) expect(known.has(c), `${ours} → ${c}`).toBe(true);
      }
    }
  });

  it("is keyed by values the season editor actually offers", () => {
    const genres = new Set<string>(GENRES.map((g) => g.value));
    const tags = new Set<string>(TAGS.map((t) => t.value));
    for (const key of Object.keys(F2G_GENRE_CATEGORIES)) expect(genres.has(key), key).toBe(true);
    for (const key of Object.keys(F2G_TAG_CATEGORIES)) expect(tags.has(key), key).toBe(true);
  });
});

describe("planF2gQueries", () => {
  /**
   * The report: the horror template on a FreeToGame season rolled nothing.
   * (action OR adventure) AND (horror OR survival OR atmospheric OR zombie):
   * adventure and atmospheric are unknown to FreeToGame, the rest are asked
   * as AND-pairs.
   */
  it("turns the horror template into one request per genre/tag pair", () => {
    const tpl = getTemplate("horror")!;
    const plan = planF2gQueries(filters(tpl.filters.genres ?? [], tpl.filters.tags ?? []), rng)!;
    expect(plan.queries.map((q) => q.categories.join("."))).toEqual(["action.horror", "action.survival", "action.zombie"]);
    for (const q of plan.queries) expect(q.genres).toEqual(["action"]);
    expect(plan.queries.map((q) => q.tags)).toEqual([["horror"], ["survival"], ["zombie"]]);
  });

  it("keeps AND across groups: every request carries one genre category and one tag category", () => {
    const plan = planF2gQueries(filters(["shooter", "rpg"], ["horror", "fantasy"]), rng, 100)!;
    for (const q of plan.queries) {
      expect(q.genres.length, q.categories.join(".")).toBeGreaterThan(0);
      expect(q.tags.length, q.categories.join(".")).toBeGreaterThan(0);
    }
    // shooter → 2 categories, rpg → 2; horror → 1, fantasy → 1
    expect(plan.queries).toHaveLength(8);
  });

  it("asks one category per request when only one group is set", () => {
    expect(planF2gQueries(filters(["rpg"], []), rng)!.queries.map((q) => q.categories)).toEqual([["mmorpg"], ["action-rpg"]]);
    expect(planF2gQueries(filters([], ["zombie"]), rng)!.queries.map((q) => q.categories)).toEqual([["zombie"]]);
  });

  it("asks for the unfiltered list when the season filters nothing", () => {
    expect(planF2gQueries(filters([], []), rng)).toEqual({ queries: [{ categories: [], genres: [], tags: [] }], platform: null });
  });

  it("refuses a group FreeToGame knows nothing of — an OR over nothing matches nothing", () => {
    expect(planF2gQueries(filters(["puzzle", "adventure"], []), rng)).toBeNull();
    expect(planF2gQueries(filters(["action"], ["atmospheric"]), rng)).toBeNull();
  });

  it("maps the platform filter to FreeToGame's, and refuses one it cannot serve", () => {
    expect(planF2gQueries(filters([], [], ["pc"]), rng)!.platform).toBe("pc");
    expect(planF2gQueries(filters([], [], ["web"]), rng)!.platform).toBe("browser");
    expect(planF2gQueries(filters([], [], ["pc", "web", "ios"]), rng)!.platform).toBeNull();
    expect(planF2gQueries(filters([], [], ["playstation5"]), rng)).toBeNull();
  });

  it("caps the requests per roll, without repeats", () => {
    const tpl = getTemplate("esports")!;
    const plan = planF2gQueries(filters(tpl.filters.genres ?? [], tpl.filters.tags ?? []), Math.random)!;
    expect(plan.queries.length).toBeLessThanOrEqual(F2G_MAX_QUERIES);
    const keys = plan.queries.map((q) => q.categories.join("."));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("attributes a category shared by two season values to both", () => {
    const plan = planF2gQueries(filters([], ["roguelike", "roguelite"]), rng)!;
    expect(plan.queries).toEqual([{ categories: ["permadeath"], genres: [], tags: ["roguelike", "roguelite"] }]);
  });
});

describe("mergeF2gResults", () => {
  it("unions the answers and credits a game with every request that returned it", () => {
    const merged = mergeF2gResults([
      { query: { categories: ["action", "horror"], genres: ["action"], tags: ["horror"] }, games: [{ id: 1 }, { id: 2 }] },
      { query: { categories: ["action", "zombie"], genres: ["action"], tags: ["zombie"] }, games: [{ id: 2 }, { id: 3 }] },
    ]);
    const byId = Object.fromEntries(merged.map((m) => [m.game.id, m]));
    expect(Object.keys(byId).sort()).toEqual(["1", "2", "3"]);
    expect(byId[2]!.tags.sort()).toEqual(["horror", "zombie"]);
    expect(byId[2]!.genres).toEqual(["action"]);
  });
});

describe("f2gMainGenre", () => {
  it("translates FreeToGame's free-text genre into ours", () => {
    expect(f2gMainGenre(" MMORPG")).toEqual({ genres: ["massively-multiplayer", "rpg"], tags: [] });
    expect(f2gMainGenre("Card Game")).toEqual({ genres: ["card"], tags: [] });
    expect(f2gMainGenre("Fantasy")).toEqual({ genres: [], tags: ["fantasy"] });
  });

  it("keeps an unknown label as its own slug rather than dropping it", () => {
    expect(f2gMainGenre("Auto Battler")).toEqual({ genres: ["auto-battler"], tags: [] });
    expect(f2gMainGenre(null)).toEqual({ genres: [], tags: [] });
  });
});

describe("f2gFilterSupport", () => {
  it("names what FreeToGame ignores in the horror template, without blocking it", () => {
    const tpl = getTemplate("horror")!;
    expect(f2gFilterSupport(filters(tpl.filters.genres ?? [], tpl.filters.tags ?? []))).toEqual({
      ignoredGenres: ["adventure"],
      ignoredTags: ["atmospheric"],
      blocked: null,
    });
  });

  it("says when no game can match at all — and agrees with the planner", () => {
    for (const f of [filters(["puzzle"], []), filters([], ["story-rich"]), filters([], [], ["ios"])]) {
      expect(f2gFilterSupport(f).blocked, JSON.stringify(f)).not.toBeNull();
      expect(planF2gQueries(f, rng), JSON.stringify(f)).toBeNull();
    }
    expect(f2gFilterSupport(filters(["puzzle"], [])).blocked).toBe("genres");
    expect(f2gFilterSupport(filters([], ["story-rich"])).blocked).toBe("tags");
    expect(f2gFilterSupport(filters([], [], ["ios"])).blocked).toBe("platforms");
  });
});

describe("planF2gQueries under a primary tag", () => {
  const withPrimary = (primaryTag: string | null, genres: string[], tags: string[], platforms: string[] = []) => ({
    genres,
    tags,
    platforms,
    primaryTag,
  });

  /**
   * The report: a Horror season on FreeToGame handed out Naraka: Bladepoint,
   * which FreeToGame files under action and survival. Every request now
   * carries the horror category, so nothing outside it can come back.
   */
  it("asks only for games in the primary category", () => {
    const tpl = getTemplate("horror")!;
    const plan = planF2gQueries(withPrimary("horror", tpl.filters.genres ?? [], tpl.filters.tags ?? []), rng)!;
    expect(plan.queries.length).toBeGreaterThan(0);
    for (const q of plan.queries) expect(q.categories, q.categories.join(".")).toContain("horror");
    for (const q of plan.queries) expect(q.tags).toContain("horror");
  });

  // The bare category request is what makes a horror game without any of the
  // season's other values reachable at all; the pairs only add what each
  // returned game is known to carry, for ranking.
  it("always asks for the primary category on its own, and pairs it with the rest", () => {
    const plan = planF2gQueries(withPrimary("horror", ["action"], ["zombie", "atmospheric"]), rng)!;
    expect(plan.queries.map((q) => q.categories.join("."))).toEqual(["horror", "horror.action", "horror.zombie"]);
    expect(plan.queries[1]).toEqual({ categories: ["horror", "action"], genres: ["action"], tags: ["horror"] });
  });

  it("credits a genre-like primary tag as a genre", () => {
    const plan = planF2gQueries(withPrimary("strategy", [], []), rng)!;
    expect(plan.queries.map((q) => q.categories)).toEqual([["strategy"], ["moba"], ["tower-defense"], ["mmorts"]]);
    for (const q of plan.queries) expect(q).toMatchObject({ genres: ["strategy"], tags: [] });
  });

  it("never lets the other genres and tags block the pool", () => {
    // puzzle and story-rich are unknown to FreeToGame; without a primary tag
    // this season could not be served at all
    expect(planF2gQueries(withPrimary(null, ["puzzle"], ["story-rich"]), rng)).toBeNull();
    expect(planF2gQueries(withPrimary("horror", ["puzzle"], ["story-rich"]), rng)!.queries).toEqual([
      { categories: ["horror"], genres: [], tags: ["horror"] },
    ]);
  });

  it("refuses a primary tag FreeToGame cannot tell apart", () => {
    expect(planF2gQueries(withPrimary("indie", [], []), rng)).toBeNull();
    expect(planF2gQueries(withPrimary("retro", ["action"], ["horror"]), rng)).toBeNull();
  });

  it("stays within the request cap and keeps the bare request", () => {
    const tpl = getTemplate("esports")!;
    for (let i = 0; i < 20; i++) {
      const plan = planF2gQueries(withPrimary("multiplayer", tpl.filters.genres ?? [], tpl.filters.tags ?? []), Math.random)!;
      expect(plan.queries.length).toBeLessThanOrEqual(F2G_MAX_QUERIES);
      const keys = plan.queries.map((q) => q.categories.join("."));
      expect(keys).toEqual(expect.arrayContaining(["pvp", "pve"]));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("f2gFilterSupport under a primary tag", () => {
  const withPrimary = (primaryTag: string, genres: string[], tags: string[], platforms: string[] = []) => ({
    genres,
    tags,
    platforms,
    primaryTag,
  });

  it("blocks on the primary tag alone, and agrees with the planner", () => {
    for (const primary of ["indie", "retro", "adventure", "atmospheric"]) {
      expect(f2gFilterSupport(withPrimary(primary, [], [])).blocked, primary).toBe("primary");
      expect(planF2gQueries(withPrimary(primary, [], []), rng), primary).toBeNull();
    }
  });

  it("does not block on the other groups, only names what it ignores", () => {
    expect(f2gFilterSupport(withPrimary("horror", ["puzzle"], ["story-rich"]))).toEqual({
      ignoredGenres: ["puzzle"],
      ignoredTags: ["story-rich"],
      blocked: null,
    });
  });

  it("does not list the primary tag among what it ignores", () => {
    expect(f2gFilterSupport(withPrimary("horror", [], ["horror", "atmospheric"])).ignoredTags).toEqual(["atmospheric"]);
  });

  it("still blocks on a platform FreeToGame does not have", () => {
    expect(f2gFilterSupport(withPrimary("horror", [], [], ["ios"])).blocked).toBe("platforms");
  });

  it("serves every template's primary tag but indie and retro", () => {
    const blocked = TEMPLATE_IDS.filter((id) => {
      const tpl = getTemplate(id)!;
      return f2gFilterSupport(withPrimary(tpl.filters.primaryTag!, tpl.filters.genres ?? [], tpl.filters.tags ?? [], tpl.filters.platforms ?? [])).blocked !== null;
    });
    expect(blocked.sort()).toEqual(["indie", "retro"]);
  });
});
