import { describe, expect, it } from "vitest";

import { compileEntry } from "../dsl/compile";
import type { EntryDoc } from "../dsl/doc";
import { IDS, effectDoc, itemDoc, player, resolve } from "../dsl/fixtures.test-helpers";
import type { IeeParams, UsePick } from "../../types/iee";
import {
  NO_POOL_SHAPE,
  drawDistinct,
  drawWeighted,
  favourOf,
  gameMatches,
  narrowsPool,
  offersChoice,
  poolAllows,
  poolShapeOf,
  type PoolBase,
  type PoolGame,
  type PoolSource,
} from "./pool";

const compiled = (doc: EntryDoc) => compileEntry({ entryId: IDS.self, revisionId: `rev-${doc.slug}`, doc, resolve });
const source = (id: string, doc: EntryDoc, chosen: UsePick | null = null, params: IeeParams = {}): PoolSource => ({
  instanceId: id,
  entry: compiled(doc),
  params,
  chosen,
});
const pickRule = (doc: Partial<EntryDoc>) =>
  effectDoc({ character: "bonus", duration: { unit: "next_game" }, stacking: { mode: "refresh" }, ...doc });
const base = (over: Partial<PoolBase> = {}): PoolBase => ({
  self: player("sp-me"),
  selfEntries: [],
  games: { lastPassed: ["puzzle", "indie"], passed: ["puzzle", "indie", "horror"] },
  rng: () => 0,
  ...over,
});
const game = (id: string, over: Partial<PoolGame> = {}): PoolGame => ({ id, genres: ["rpg"], year: 2005, rating: 4, ...over });

describe("poolShapeOf — what the holder's rules do to the pick (spec §6.16)", () => {
  it("an exclusion of the genre the use picked reads the pick its effect remembers", () => {
    const veto = source("i-veto", pickRule({ slug: "veto", rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "picked" }] }] }), { genre: "horror" });
    const shape = poolShapeOf([veto], base());
    expect(shape.exclude).toEqual([{ genres: ["horror"] }]);
    expect(shape.require).toEqual([]);
    expect(shape.firings).toEqual([
      { instanceId: "i-veto", revisionId: "rev-veto", key: "veto", ruleIndex: 0, contributions: [{ kind: "exclude", match: { genres: ["horror"] } }], draws: [] },
    ]);
  });

  it("a set that reads nothing matches nothing: no pick of its kind, no game passed — the rule says nothing", () => {
    const pick = source("i-pick", pickRule({ slug: "pick", rules: [{ when: "beforeGameRoll", do: [{ op: "poolRequire", genres: "picked" }] }] }), { years: [1990, 1999] });
    const trial = source("i-trial", pickRule({ slug: "trial", rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "lastPassed" }] }] }));
    const fresh = base({ games: { lastPassed: null, passed: [] } });
    expect(poolShapeOf([pick, trial], fresh)).toEqual(NO_POOL_SHAPE);
    // Once a game is passed, the trial reads its genres.
    expect(poolShapeOf([trial], base()).exclude).toEqual([{ genres: ["puzzle", "indie"] }]);
  });

  it("reads every passed game's genres, the span the use picked, the season's years and a rating", () => {
    const uncharted = source("i-u", pickRule({ slug: "uncharted", rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "passed" }] }] }));
    const era = source("i-era", pickRule({ slug: "era", rules: [{ when: "beforeGameRoll", do: [{ op: "poolRequire", years: "picked" }] }] }), { years: [1990, 1999] });
    const old = source(
      "i-old",
      pickRule({
        slug: "old_hardware",
        params: { lastYear: { type: "int", default: 2009, min: 1980, max: 2020 } },
        rules: [{ when: "beforeGameRoll", do: [{ op: "poolRequire", years: { max: { param: "lastYear" } }, rating: { min: 3.5 } }] }],
      }),
      null,
      { lastYear: 2004 },
    );
    const shape = poolShapeOf([uncharted, era, old], base());
    expect(shape.exclude).toEqual([{ genres: ["puzzle", "indie", "horror"] }]);
    expect(shape.require).toEqual([
      { years: { min: 1990, max: 1999 } },
      { years: { min: null, max: 2004 }, rating: { min: 3.5, max: null } },
    ]);
  });

  it("a listed genre is matched in any case, each once", () => {
    const list = source("i-l", pickRule({ slug: "list", rules: [{ when: "beforeGameRoll", do: [{ op: "poolRequire", genres: ["rpg", "horror"] }] }] }));
    expect(poolShapeOf([list], base()).require).toEqual([{ genres: ["rpg", "horror"] }]);
  });

  it("a favoured game weighs the largest factor that favours it; one with no game picked favours nothing", () => {
    const fav = (id: string, factor: number, chosen: UsePick | null) =>
      source(id, pickRule({ slug: `fav_${id}`, rules: [{ when: "beforeGameRoll", do: [{ op: "poolFavor", factor }] }] }), chosen);
    const pick = { gameId: "g-1", title: "Hollow Knight" };
    const shape = poolShapeOf([fav("a", 2, pick), fav("b", 4, pick), fav("c", 3, { gameId: "g-2", title: "Celeste" }), fav("d", 5, { genre: "rpg" })], base());
    expect(shape.favor).toEqual([
      { gameId: "g-1", factor: 4 },
      { gameId: "g-2", factor: 3 },
    ]);
    expect(shape.firings.map((f) => f.instanceId)).toEqual(["a", "b", "c"]);
    expect(narrowsPool(shape)).toBe(false);
  });

  it("asks a rule's conditions with the server's draws, and keeps them for the journal", () => {
    const coin = source(
      "i-coin",
      pickRule({ slug: "coin", rules: [{ when: "beforeGameRoll", if: [{ op: "chance", percent: 50 }], do: [{ op: "poolExclude", rating: { max: 2 } }] }] }),
    );
    expect(poolShapeOf([coin], base({ rng: () => 0.25 })).firings).toMatchObject([{ draws: [0.25], contributions: [{ kind: "exclude" }] }]);
    expect(poolShapeOf([coin], base({ rng: () => 0.75 }))).toEqual(NO_POOL_SHAPE);
  });

  it("a passive item shapes its holder's pick as an effect does", () => {
    const charm = source("i-charm", itemDoc({ slug: "charm", usage: { activation: "passive" }, rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", rating: { max: 2 } }] }] }));
    expect(poolShapeOf([charm], base()).exclude).toEqual([{ rating: { min: null, max: 2 } }]);
  });
});

describe("gameMatches and poolAllows — which games a rule names", () => {
  it("one of its genres in the set, in any case", () => {
    expect(gameMatches(game("g", { genres: ["RPG", "Action"] }), { genres: ["rpg"] })).toBe(true);
    expect(gameMatches(game("g", { genres: ["action"] }), { genres: ["rpg", "horror"] })).toBe(false);
    expect(gameMatches(game("g", { genres: [] }), { genres: ["rpg"] })).toBe(false);
  });

  it("a span and a rating hold their bounds; a game the catalog knows nothing of matches none", () => {
    expect(gameMatches(game("g", { year: 1995 }), { years: { min: 1990, max: 1999 } })).toBe(true);
    expect(gameMatches(game("g", { year: 2000 }), { years: { min: 1990, max: 1999 } })).toBe(false);
    expect(gameMatches(game("g", { year: 2009 }), { years: { min: null, max: 2009 } })).toBe(true);
    expect(gameMatches(game("g", { year: null }), { years: { min: null, max: 2009 } })).toBe(false);
    expect(gameMatches(game("g", { rating: 3.5 }), { rating: { min: 3.5, max: null } })).toBe(true);
    expect(gameMatches(game("g", { rating: null }), { rating: { min: 0, max: null } })).toBe(false);
  });

  it("names the games that match every part it gives", () => {
    const oldRpg = { genres: ["rpg"], years: { min: null, max: 2000 } };
    expect(gameMatches(game("g", { year: 1998 }), oldRpg)).toBe(true);
    expect(gameMatches(game("g", { year: 2005 }), oldRpg)).toBe(false);
    expect(gameMatches(game("g", { genres: ["puzzle"], year: 1998 }), oldRpg)).toBe(false);
  });

  it("a game is drawn when no exclusion names it and every requirement does", () => {
    const shape = { exclude: [{ genres: ["horror"] }], require: [{ years: { min: 2000, max: null } }, { rating: { min: 3, max: null } }] };
    expect(poolAllows(game("g", { genres: ["rpg"], year: 2005, rating: 4 }), shape)).toBe(true);
    expect(poolAllows(game("g", { genres: ["horror"], year: 2005, rating: 4 }), shape)).toBe(false);
    expect(poolAllows(game("g", { year: 1999 }), shape)).toBe(false);
    expect(poolAllows(game("g", { rating: 2 }), shape)).toBe(false);
    expect(poolAllows(game("g"), NO_POOL_SHAPE)).toBe(true);
  });
});

describe("drawWeighted — the draw among the first candidates (spec §7.12 step 4)", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("an even draw when nothing is favoured", () => {
    expect(drawWeighted(candidates, NO_POOL_SHAPE, () => 0)?.id).toBe("a");
    expect(drawWeighted(candidates, NO_POOL_SHAPE, () => 0.5)?.id).toBe("b");
    expect(drawWeighted(candidates, NO_POOL_SHAPE, () => 0.99)?.id).toBe("c");
    expect(drawWeighted([], NO_POOL_SHAPE, () => 0)).toBeNull();
  });

  it("a favoured game weighs its factor: ×3 among three is three of five", () => {
    const shape = { favor: [{ gameId: "b", factor: 3 }] };
    expect(favourOf("b", shape)).toBe(3);
    expect(favourOf("a", shape)).toBe(1);
    // a: [0, 0.2), b: [0.2, 0.8), c: [0.8, 1)
    expect(drawWeighted(candidates, shape, () => 0.19)?.id).toBe("a");
    expect(drawWeighted(candidates, shape, () => 0.2)?.id).toBe("b");
    expect(drawWeighted(candidates, shape, () => 0.79)?.id).toBe("b");
    expect(drawWeighted(candidates, shape, () => 0.8)?.id).toBe("c");
  });
});

describe("a choice of games (`chooseOfN`, spec §7.12 step 5)", () => {
  const choice = (id: string, n: number) =>
    source(id, pickRule({ slug: `doors_${n}`, rules: [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n }] }] }));

  it("the largest choice counts, beside what narrows the pool", () => {
    const veto = source("i-veto", pickRule({ slug: "veto", rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "picked" }] }] }), { genre: "horror" });
    const shape = poolShapeOf([choice("i-two", 2), veto, choice("i-three", 3)], base());
    expect(shape.choice).toBe(3);
    expect(shape.exclude).toEqual([{ genres: ["horror"] }]);
    expect(shape.firings.map((f) => f.contributions)).toEqual([[{ kind: "choose", n: 2 }], [{ kind: "exclude", match: { genres: ["horror"] } }], [{ kind: "choose", n: 3 }]]);
    // A choice narrows nothing: nothing to set aside when the pool runs dry.
    expect(narrowsPool(poolShapeOf([choice("i-two", 2)], base()))).toBe(false);
    expect(NO_POOL_SHAPE.choice).toBe(0);
  });

  it("is offered with two games or more to offer", () => {
    expect(offersChoice({ choice: 3 }, 5)).toBe(true);
    expect(offersChoice({ choice: 3 }, 2)).toBe(true);
    expect(offersChoice({ choice: 3 }, 1)).toBe(false);
    expect(offersChoice({ choice: 0 }, 5)).toBe(false);
  });

  it("draws different games one after another, each weighing its favour; fewer when there are fewer", () => {
    const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(drawDistinct(candidates, NO_POOL_SHAPE, 3, () => 0).map((g) => g.id)).toEqual(["a", "b", "c"]);
    expect(drawDistinct(candidates, NO_POOL_SHAPE, 3, () => 0.999).map((g) => g.id)).toEqual(["d", "c", "b"]);
    expect(drawDistinct(candidates, NO_POOL_SHAPE, 9, () => 0).map((g) => g.id)).toEqual(["a", "b", "c", "d"]);
    // ×5 on c: a [0, 1/8), b [1/8, 2/8), c [2/8, 7/8) — then among a, b, d.
    expect(drawDistinct(candidates, { favor: [{ gameId: "c", factor: 5 }] }, 2, () => 0.5).map((g) => g.id)).toEqual(["c", "b"]);
    expect(drawDistinct([], NO_POOL_SHAPE, 2, () => 0)).toEqual([]);
  });
});
