/**
 * Picking a participant's next game (docs/IEE_CONSTRUCTOR_SPEC.md §7.12): a
 * set-aside game that is due, or the season's pool as their rules shape it —
 * and, once the pick stands, the roll or the choice, with a journal row for
 * each rule that shaped it. The pool's SQL needs a database; here it is the
 * boundary, and what it is asked is the contract.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogGame, SeasonPlayer } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, IeeConfigSchema, type SeasonConfig } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";
import { NO_POOL_SHAPE } from "@/lib/engine/iee/resolve/pool";
import type * as Registry from "@/lib/modules/iee/registry";
import { buildRegistry } from "@/lib/modules/iee/registry";
import { grant, type DecisionNote, type ExecContext } from "@/lib/modules/iee/executor";
import { memoryStore } from "@/lib/modules/iee/executor/memory-store.test-helpers";

import { endGameInFlight, gameOffer, pickNextGame, replacementPayload, startNextGame, type NextGame } from "./pick";

const catalogRepo = vi.hoisted(() => ({
  pickGameForRoll: vi.fn(),
  gamesViewOf: vi.fn(),
  dueSetAside: vi.fn(),
  createRoll: vi.fn(),
  reopenSetAside: vi.fn(),
  dropSetAsides: vi.fn(),
  endRollInFlight: vi.fn(),
}));
vi.mock("@/lib/modules/catalog/repository", () => catalogRepo);

const registryMod = vi.hoisted(() => ({ getSeasonRegistry: vi.fn() }));
vi.mock("@/lib/modules/iee/registry", async (importOriginal) => ({ ...(await importOriginal<typeof Registry>()), ...registryMod }));

const ieeRepo = vi.hoisted(() => ({ listActiveInstances: vi.fn(), toPlayerSnapshot: vi.fn() }));
vi.mock("@/lib/modules/iee/repository", () => ieeRepo);

const context = vi.hoisted(() => ({ executionContext: vi.fn() }));
vi.mock("@/lib/modules/iee/executor/context", () => context);

const ME = "sp-me";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const doc = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
  dslVersion: 1,
  kind: "effect",
  slug,
  name: { ru: slug, en: slug, uk: slug },
  character: "bonus",
  rarity: "common",
  tags: [],
  duration: { unit: "next_game" },
  stacking: { mode: "refresh" },
  rules: [],
  ...over,
});
const registry = buildRegistry(
  compileSet([
    { entryId: ID(1), revisionId: ID(101), doc: doc("veto", { rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "picked" }] }] }) },
    { entryId: ID(2), revisionId: ID(102), doc: doc("swift", { rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }] }) },
    { entryId: ID(3), revisionId: ID(103), doc: doc("doors", { rules: [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 3 }] }] }) },
  ]),
);

const sp = { id: ME, seasonId: "season-1", rollSeq: 7, position: 10, balancePoints: 5, status: "active" } as SeasonPlayer;
const config = (enabled: boolean): SeasonConfig => ({ ...DEFAULT_SEASON_CONFIG, iee: IeeConfigSchema.parse({ ...DEFAULT_SEASON_CONFIG.iee, enabled }) });
const game = (id: string, title: string, over: Partial<CatalogGame> = {}) =>
  ({ id, title, coverUrl: null, genres: ["rpg"], releasedAt: new Date("2005-06-01T00:00:00Z"), rating: "4.5", platform: "pc", isBlacklisted: false, ...over }) as CatalogGame;
const GAME = game("game-1", "Celeste");
const NOTHING_ASIDE = { due: null, dropped: [] };

/** With an entry that gives the holder's game a completion condition (wave C, spec §6.17). */
const withHard = buildRegistry(
  compileSet([
    { entryId: ID(3), revisionId: ID(103), doc: doc("doors", { rules: [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 3 }] }] }) },
    {
      entryId: ID(4),
      revisionId: ID(104),
      doc: doc("hard", {
        character: "penalty",
        tags: ["game_condition"],
        rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: { ru: "На высокой сложности" } }] }],
      }),
    },
  ]),
);

/** A holder's instances, granted the way the game grants them. */
async function holding(...grants: { entry: string; chosen?: { genre: string } }[]) {
  return holdingIn(registry, ...grants);
}

async function holdingIn(reg: typeof registry, ...grants: { entry: string; chosen?: { genre: string } }[]) {
  const mem = memoryStore({ names: { [ME]: "me" } });
  const exec: ExecContext = {
    store: mem.store,
    seasonId: "season-1",
    registry: reg,
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng: () => 0,
    snapshot: async (id) => ({ seasonPlayerId: id, position: 10, balancePoints: 5, rollSeq: 7, moveCount: 3, rank: 1, status: "active" }),
    anchorFor: async () => ({ anchorRollSeq: 7 }),
  };
  for (const g of grants) await grant(exec, { entry: g.entry, to: ME, source: "item", reveal: false, ...(g.chosen ? { chosen: g.chosen } : {}) });
  ieeRepo.listActiveInstances.mockResolvedValue(await mem.store.activeForHolder(ME));
  // Decisions opened go where the caller collects them, as the real context does.
  context.executionContext.mockImplementation(async (input: { decisions?: DecisionNote[] }) => ({ ...exec, ...(input.decisions ? { decisions: input.decisions } : {}) }));
  return mem;
}

const started = (next: NextGame, over: Partial<Parameters<typeof startNextGame>[4]> = {}) =>
  startNextGame("tx" as never, sp, config(true), next as Exclude<NextGame, { kind: "none" }>, { origin: "roll", replacedRollId: null, item: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  registryMod.getSeasonRegistry.mockResolvedValue(registry);
  ieeRepo.toPlayerSnapshot.mockResolvedValue({ seasonPlayerId: ME, position: 10, balancePoints: 5, rollSeq: 7, moveCount: 3, rank: 1, status: "active" });
  catalogRepo.gamesViewOf.mockResolvedValue({ lastPassed: null, passed: [] });
  catalogRepo.dueSetAside.mockResolvedValue(NOTHING_ASIDE);
  catalogRepo.pickGameForRoll.mockResolvedValue({ game: GAME, reason: null, relaxed: false, favoured: false, offered: [] });
  catalogRepo.createRoll.mockImplementation(async (_sp: string, gameId: string) => ({ id: `roll-of-${gameId}`, gameId }));
});

describe("pickNextGame", () => {
  it("a season without items and effects picks as it always has", async () => {
    const rng = () => 0.3;
    const next = await pickNextGame(sp, config(false), rng);
    expect(catalogRepo.dueSetAside).toHaveBeenCalledWith(ME, 7);
    expect(catalogRepo.pickGameForRoll).toHaveBeenCalledWith(ME, NO_POOL_SHAPE, rng);
    expect(registryMod.getSeasonRegistry).not.toHaveBeenCalled();
    expect(next).toEqual({ kind: "game", game: GAME, shape: NO_POOL_SHAPE, relaxed: false, favoured: false, dropped: [] });
  });

  it("with nothing that shapes the pick, the pool is asked plainly", async () => {
    await holding({ entry: "swift" });
    const next = await pickNextGame(sp, config(true));
    expect(catalogRepo.pickGameForRoll).toHaveBeenCalledWith(ME, NO_POOL_SHAPE, expect.any(Function));
    expect(catalogRepo.gamesViewOf).not.toHaveBeenCalled();
    expect(next.kind).toBe("game");
  });

  it("the holder's rules shape the pool's draw", async () => {
    await holding({ entry: "veto", chosen: { genre: "horror" } }, { entry: "swift" });
    const rng = () => 0.5;
    const next = await pickNextGame(sp, config(true), rng);
    expect(catalogRepo.gamesViewOf).toHaveBeenCalledWith(ME);
    expect(catalogRepo.pickGameForRoll).toHaveBeenCalledWith(ME, expect.objectContaining({ exclude: [{ genres: ["horror"] }], require: [], favor: [], choice: 0 }), rng);
    expect(next.kind === "game" && next.shape.firings.map((f) => f.key)).toEqual(["veto"]);
  });

  it("an empty pool says why", async () => {
    await holding({ entry: "veto", chosen: { genre: "horror" } });
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: null, reason: "all_played" });
    expect(await pickNextGame(sp, config(true))).toEqual({ kind: "none", reason: "all_played" });
  });

  it("a set-aside game that is due is the next game: no draw, no rules (§7.12 step 1)", async () => {
    await holding({ entry: "veto", chosen: { genre: "horror" } });
    const back = game("game-9", "Hollow Knight");
    catalogRepo.dueSetAside.mockResolvedValue({ due: { rollId: "roll-old", game: back }, dropped: ["roll-gone"] });
    const next = await pickNextGame(sp, config(true));
    expect(next).toEqual({ kind: "returned", rollId: "roll-old", game: back, dropped: ["roll-gone"] });
    expect(catalogRepo.pickGameForRoll).not.toHaveBeenCalled();
    expect(registryMod.getSeasonRegistry).not.toHaveBeenCalled();
  });

  it("a choice the holder's rules ask for offers the games the pool drew (§7.12 step 5)", async () => {
    await holding({ entry: "doors" });
    const offered = [GAME, game("game-2", "Hades"), game("game-3", "Inside")];
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: GAME, reason: null, relaxed: false, favoured: false, offered });
    const next = await pickNextGame(sp, config(true));
    expect(catalogRepo.pickGameForRoll).toHaveBeenCalledWith(ME, expect.objectContaining({ choice: 3 }), expect.any(Function));
    expect(next).toMatchObject({ kind: "choice", games: offered, relaxed: false });
  });
});

describe("startNextGame", () => {
  it("creates the roll and journals what shaped the pick with it", async () => {
    const mem = await holding({ entry: "veto", chosen: { genre: "horror" } });
    const next = await pickNextGame(sp, config(true));
    const done = await started(next);
    expect(done).toEqual({ rollId: "roll-of-game-1", game: GAME, returned: false, choice: null });
    expect(catalogRepo.createRoll).toHaveBeenCalledWith(ME, "game-1", "tx");
    expect(catalogRepo.dropSetAsides).toHaveBeenCalledWith("tx", []);
    expect(context.executionContext).toHaveBeenCalledWith(expect.objectContaining({ tx: "tx", seasonId: "season-1", actorPlayerId: ME, registry }));
    expect(mem.journal.filter((j) => j.op === "pool")).toEqual([
      expect.objectContaining({
        targetPlayerId: ME,
        revisionId: ID(101),
        intent: { entry: "veto", contributions: [{ kind: "exclude", match: { genres: ["horror"] } }] },
        outcome: { rollId: "roll-of-game-1", gameId: "game-1", favoured: false, relaxed: false },
      }),
    ]);
  });

  it("says when the rules were set aside because nothing was left with them", async () => {
    const mem = await holding({ entry: "veto", chosen: { genre: "horror" } });
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: GAME, reason: null, relaxed: true, favoured: false, offered: [] });
    await started(await pickNextGame(sp, config(true)));
    expect(mem.journal.find((j) => j.op === "pool")?.outcome).toMatchObject({ relaxed: true });
  });

  it("a rule that reads nothing shapes nothing, and nothing is journaled", async () => {
    const mem = await holding({ entry: "veto" });
    await started(await pickNextGame(sp, config(true)));
    expect(mem.journal.filter((j) => j.op === "pool")).toEqual([]);
    expect(context.executionContext).not.toHaveBeenCalled();
  });

  it("a set-aside game comes back on its own roll, open again; those that never will are let go", async () => {
    const back = game("game-9", "Hollow Knight");
    catalogRepo.reopenSetAside.mockResolvedValue({ id: "roll-old", gameId: "game-9" });
    const done = await started({ kind: "returned", rollId: "roll-old", game: back, dropped: ["roll-gone"] });
    expect(done).toEqual({ rollId: "roll-old", game: back, returned: true, choice: null });
    expect(catalogRepo.dropSetAsides).toHaveBeenCalledWith("tx", ["roll-gone"]);
    expect(catalogRepo.reopenSetAside).toHaveBeenCalledWith("tx", "roll-old");
    expect(catalogRepo.createRoll).not.toHaveBeenCalled();
    // Raced: it came back already — nothing to do but refuse.
    catalogRepo.reopenSetAside.mockResolvedValue(null);
    await expect(started({ kind: "returned", rollId: "roll-old", game: back, dropped: [] })).rejects.toMatchObject({ code: "gameRollAlreadyResolved" });
  });

  it("a choice opens and waits for the player: no roll, the games as they were, the pool rows naming it", async () => {
    const mem = await holding({ entry: "doors" });
    const offered = [GAME, game("game-2", "Hades", { coverUrl: "/h.png", genres: ["action", "roguelike"], releasedAt: null, rating: null })];
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: GAME, reason: null, relaxed: false, favoured: false, offered });
    const decisions: DecisionNote[] = [];
    const done = await started(await pickNextGame(sp, config(true)), {
      origin: "postpone",
      replacedRollId: "roll-1",
      item: { key: "postponed_game", names: { ru: "Отложенная игра", en: "Postponed Game", uk: "Відкладена гра" } },
      decisions,
    });
    expect(catalogRepo.createRoll).not.toHaveBeenCalled();
    const [row] = mem.decisions;
    expect(done).toEqual({ rollId: null, game: null, returned: false, choice: { decisionId: row!.id, offered: 2 } });
    expect(row).toMatchObject({
      kind: "game_choice",
      status: "pending",
      playerId: ME,
      options: [{ id: "take", kind: "take", params: { among: ["game-1", "game-2"] } }],
      context: {
        origin: "postpone",
        replacedRollId: "roll-1",
        itemKey: "postponed_game",
        games: [
          { gameId: "game-1", title: "Celeste", coverUrl: null, genres: ["rpg"], year: 2005, rating: 4.5, platform: "pc" },
          { gameId: "game-2", title: "Hades", coverUrl: "/h.png", genres: ["action", "roguelike"], year: null, rating: null, platform: "pc" },
        ],
      },
    });
    expect(decisions).toEqual([{ decisionId: row!.id, playerId: ME, kind: "game_choice", status: "pending" }]);
    expect(mem.journal.filter((j) => j.op === "pool")).toEqual([
      expect.objectContaining({ outcome: { decisionId: row!.id, offered: ["game-1", "game-2"], relaxed: false } }),
    ]);
  });
});

describe("startNextGame — completion conditions (wave C, spec §6.17)", () => {
  beforeEach(() => registryMod.getSeasonRegistry.mockResolvedValue(withHard));
  const conditionsOf = async (mem: Awaited<ReturnType<typeof holding>>, rollId: string) =>
    (await mem.store.activeForRoll(rollId)).map((row) => row.params);

  it("the roll written gets the conditions its holder's rules give; a season without items asks nothing", async () => {
    const mem = await holdingIn(withHard, { entry: "hard" });
    const done = await started(await pickNextGame(sp, config(true)));
    expect(done.rollId).toBe("roll-of-game-1");
    expect(await conditionsOf(mem, "roll-of-game-1")).toEqual([{ ru: "На высокой сложности" }]);
    context.executionContext.mockClear();
    await startNextGame("tx" as never, sp, config(false), { kind: "game", game: GAME, shape: NO_POOL_SHAPE, relaxed: false, favoured: false, dropped: [] }, { origin: "roll", replacedRollId: null, item: null });
    expect(context.executionContext).not.toHaveBeenCalled();
  });

  it("a game come back asks again; a choice gets none until a game is taken", async () => {
    const mem = await holdingIn(withHard, { entry: "hard" }, { entry: "doors" });
    catalogRepo.reopenSetAside.mockResolvedValue({ id: "roll-old", gameId: "game-9" });
    await started({ kind: "returned", rollId: "roll-old", game: game("game-9", "Hollow Knight"), dropped: [] });
    expect(await conditionsOf(mem, "roll-old")).toEqual([{ ru: "На высокой сложности" }]);
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: GAME, reason: null, relaxed: false, favoured: false, offered: [GAME, game("game-2", "Hades")] });
    const waiting = await started(await pickNextGame(sp, config(true)));
    expect(waiting.choice).not.toBeNull();
    expect(mem.instances.filter((row) => row.kind === "roll_condition")).toHaveLength(1);
  });

  it("the game in flight ends with the conditions it holds; one ended already ends nothing", async () => {
    const mem = await holdingIn(withHard, { entry: "hard" });
    await started(await pickNextGame(sp, config(true)));
    catalogRepo.endRollInFlight.mockResolvedValue(true);
    await expect(endGameInFlight("tx" as never, sp, config(true), "roll-of-game-1", 9)).resolves.toBe(true);
    expect(catalogRepo.endRollInFlight).toHaveBeenCalledWith("tx", "roll-of-game-1", 9);
    expect(await conditionsOf(mem, "roll-of-game-1")).toEqual([]);
    expect(mem.journal.filter((j) => j.op === "expire")).toEqual([expect.objectContaining({ outcome: { reason: "roll_ended", rollId: "roll-of-game-1" } })]);
    catalogRepo.endRollInFlight.mockResolvedValue(false);
    await expect(endGameInFlight("tx" as never, sp, config(true), "roll-of-game-1", null)).resolves.toBe(false);
  });
});

describe("what the feed says of a pick that replaced a game", () => {
  it("the new game, one that came back, or the choice opened", () => {
    expect(replacementPayload({ rollId: "r", game: GAME, returned: false, choice: null })).toEqual({ newGameId: "game-1", title: "Celeste" });
    expect(replacementPayload({ rollId: "r", game: GAME, returned: true, choice: null })).toEqual({ newGameId: "game-1", title: "Celeste", returned: true });
    expect(replacementPayload({ rollId: null, game: null, returned: false, choice: { decisionId: "d", offered: 3 } })).toEqual({
      newGameId: null,
      title: null,
      choosing: 3,
    });
    expect(gameOffer(game("g", "Ori", { releasedAt: null }))).toMatchObject({ gameId: "g", year: null, rating: 4.5 });
  });
});
