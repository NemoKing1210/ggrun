import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG, defaultCatalogEntry, type SeasonConfig, type TurnCell } from "@/lib/engine";

import { SCENARIO_GAMES, compileSet, scenarioGame, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry, coreRegistry } from "../registry";
import { catalogRegistry } from "../registry/catalog.test-helpers";
import { entryChoiceOptions } from "../use";
import { SimError, simSeason, type SimSeasonInput } from "./season";

const CONFIG: SeasonConfig = {
  ...DEFAULT_SEASON_CONFIG,
  points: { startingBalance: 0, bonusAddsToRollOnPass: false, resetBalanceAfterUse: false },
  iee: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true, allowTargetingOthers: true, pvpProtectionMoves: 0, nothingWeight: 0 },
};

const plain = (position: number): TurnCell => ({ position, cellType: "normal", config: {} });
const every = (cellType: TurnCell["cellType"], config: Record<string, unknown> = {}) => (position: number): TurnCell => ({
  position,
  cellType,
  config,
});
/** Dice showing `face`. */
const face = (n: number) => (dice: { sides: number }) => () => (n - 0.5) / dice.sides;

function season(over: Partial<SimSeasonInput> = {}) {
  return simSeason({
    registry: coreRegistry(),
    config: CONFIG,
    players: [
      { id: "a", position: 10, balance: 5, rollSeq: 4, moveCount: 4 },
      { id: "b", position: 20, balance: 5, rollSeq: 2, moveCount: 9 },
    ],
    cellAt: plain,
    rng: () => 0,
    ...over,
  });
}

describe("simSeason — the participants' rows", () => {
  it("snapshots carry the balance, the moves and the rank among those still running", () => {
    const s = season();
    expect(s.snapshot("a")).toMatchObject({ position: 10, balancePoints: 5, rollSeq: 4, moveCount: 4, rank: 2, status: "active" });
    expect(s.snapshot("b").rank).toBe(1);
    expect(s.snapshot("ghost")).toMatchObject({ status: "withdrawn", rank: 1 });
    expect(s.context(null).seasonRollSeq).toBe(6);
  });

  it("refuses a turn of someone unknown or out of the run", async () => {
    const s = season({ players: [{ id: "a", status: "finished" }] });
    await expect(s.turn({ player: "a", outcome: "passed", spin: false })).rejects.toBeInstanceOf(SimError);
    await expect(s.turn({ player: "zz", outcome: "passed", spin: false })).rejects.toMatchObject({ code: "unknown_player" });
  });
});

describe("simSeason — a turn, in the game's order", () => {
  it("moves, counts the roll and the move, and writes the move's points", async () => {
    const s = season({ cellAt: every("penalty", { amount: 2 }) });
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(3), spin: false });
    expect([t.from, t.played.finalPosition, t.rollSeq]).toEqual([10, 13, 5]);
    expect(s.player("a")).toMatchObject({ position: 13, rollSeq: 5, moveCount: 5, streakPass: 1 });
    expect(s.balance("a")).toBe(3);
    expect(s.store.ledger).toEqual([{ seasonPlayerId: "a", delta: -2, reason: "penalty" }]);
    // Asked not to spin, the wheel only says it would.
    expect(t.played.wheel).toBe("negative");
    expect(t.wheel).toBeNull();
  });

  it("spins the wheel when asked, granting through the executor at the roll just resolved", async () => {
    const s = season({ cellAt: every("bonus"), registry: catalogRegistry({ tailwind: {} }) });
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect(t.wheel).toMatchObject({ kind: "effect", key: "tailwind" });
    const [row] = await s.holdings("a");
    expect(row).toMatchObject({ kind: "effect", anchorRollSeq: 5, source: "cell_bonus" });
    expect(t.journal.map((j) => j.op)).toEqual(["grant"]);
    // The drop counts on the wheel's next spin.
    const next = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect(next.played.movedTo - next.from).toBe(4);
  });

  it("a landing that hands out a status the player already holds renews it like a fresh copy", async () => {
    // «Тяжёлый шаг» lasts one roll. Renewed by the landing of the roll it
    // bites, it used to run out at the end of that same turn.
    const s = season({ cellAt: every("penalty"), registry: catalogRegistry({ heavy_boots: {} }) });
    await s.give("heavy_boots", "a");
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(3), spin: true });
    expect(t.played.movedTo - t.from).toBe(1);
    expect(t.wheel).toMatchObject({ kind: "effect", key: "heavy_boots" });
    expect(t.journal.find((j) => j.op === "grant")?.outcome).toMatchObject({ state: "refreshed", countFromRollSeq: 5 });
    expect(await s.holdings("a")).toMatchObject([{ remaining: 1, anchorRollSeq: 4, countFromRollSeq: 5 }]);

    const next = await s.turn({ player: "a", outcome: "passed", dice: face(3), spin: false, cellAt: plain });
    expect(next.played.movedTo - next.from).toBe(1);
    expect(await s.holdings("a")).toEqual([]);
  });

  it("a passed game renews «Отравление» without eating the new count", async () => {
    const s = season({ cellAt: every("penalty"), registry: catalogRegistry({ poison: {} }) });
    await s.give("poison", "a");
    await s.turn({ player: "a", outcome: "passed", dice: face(3), spin: true });
    expect(await s.holdings("a")).toMatchObject([{ remaining: 2 }]);
  });

  it("finishing the board finishes the run", async () => {
    const s = season({ cellAt: (p) => (p === 39 ? { position: 39, cellType: "finish", config: {} } : plain(p)) });
    s.player("a").position = 36;
    await s.turn({ player: "a", outcome: "passed", dice: face(6), spin: false });
    expect(s.player("a")).toMatchObject({ position: 39, status: "finished" });
  });

  it("a status's points after the move land on lines of their own", async () => {
    const s = season();
    await s.give("momentum", "a", { anchor: { anchorRollSeq: 4 } });
    await s.turn({ player: "a", outcome: "passed", dice: face(1), spin: false });
    expect(s.balance("a")).toBe(6);
    expect(s.store.ledger).toEqual([{ seasonPlayerId: "a", delta: 1, reason: "effect:momentum" }]);
  });
});

describe("simSeason — items", () => {
  it("uses a held item by instance, on whom the guards allow", async () => {
    const s = season();
    const given = await s.give("hex_scroll", "a");
    const used = await s.use({ player: "a", item: { instanceId: given.instanceId! }, target: "b" });
    expect(used).toMatchObject({ ok: true, code: null, target: "b" });
    expect((await s.holdings("b")).map((r) => r.revisionId)).toEqual([s.registry.get("swamp")!.revisionId]);
    expect(used.journal.map((j) => j.op)).toEqual(["use", "grant"]);
  });

  it("refuses what the item path refuses", async () => {
    const s = season();
    const given = await s.give("hex_scroll", "a");
    expect((await s.use({ player: "a", item: { instanceId: given.instanceId! }, target: null })).code).toBe("ieeTargetRequired");
    expect((await s.use({ player: "b", item: { instanceId: given.instanceId! }, target: "a" })).code).toBe("ieeItemNotFound");
    expect((await s.use({ player: "a", item: { instanceId: "nope" }, target: "b" })).code).toBe("ieeItemNotFound");
    expect((await s.use({ player: "a", item: { entry: "spare_die" }, target: null })).code).toBe("ieeItemNotFound");
    await s.use({ player: "a", item: { entry: "hex_scroll" }, target: "b" });
    expect((await s.use({ player: "a", item: { entry: "hex_scroll" }, target: "b" })).code).toBe("ieeItemAlreadyUsed");
    expect((await s.use({ player: "a", item: { instanceId: given.instanceId! }, target: "b" })).code).toBe("ieeItemAlreadyUsed");
  });

  it("a grant to someone with a game in flight waits for the game after it", async () => {
    const s = season();
    s.player("b").inFlight = true;
    const g = await s.give("swamp", "b");
    const [row] = await s.holdings("b");
    expect(g.state).toBe("granted");
    expect(row!.anchorRollSeq).toBe(3);
    await expect(s.give("swamp", "nobody")).rejects.toMatchObject({ code: "unknown_player" });
  });
});

describe("simSeason — out-of-turn moves (spec §7.3)", () => {
  /** An instant effect: it acts as it arrives and keeps nothing. */
  const instant = (slug: string, character: "bonus" | "penalty", rules: EntryDoc["rules"]): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character,
    rarity: "common",
    tags: ["movement"],
    duration: { unit: "instant" },
    rules,
  });
  const GUST = instant("gust", "bonus", [{ when: "onApply", do: [{ op: "move", by: 3 }] }]);
  const PURSUIT = instant("pursuit", "penalty", [{ when: "onApply", do: [{ op: "halveGap", who: "nearestBehind" }] }]);
  const registryOf = (...docs: EntryDoc[]) =>
    buildRegistry(
      compileSet(docs.map((doc, i) => ({ entryId: `0000000${i}-0000-4000-8000-000000000000`, revisionId: `rev-${doc.slug}`, doc }))),
    );

  it("an instant effect off the wheel moves the player at once and keeps nothing", async () => {
    const s = season({ cellAt: every("bonus"), registry: registryOf(GUST) });
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect(t.played.finalPosition).toBe(12);
    expect(t.wheel).toMatchObject({ kind: "effect", key: "gust" });
    expect(s.player("a")).toMatchObject({ position: 15, lastMoveStart: 10, moveCount: 5 });
    expect(await s.holdings("a")).toEqual([]);
    expect(t.journal.map((j) => j.op)).toEqual(["grant", "fire", "move_player", "end"]);
    // Only the regular move set where the next roll back would return to.
    expect(t.journal.find((j) => j.op === "move_player")?.outcome).toEqual({ from: 12, to: 15, finished: false });
  });

  it("reaching the finish out of turn finishes the run", async () => {
    const finish = (p: number): TurnCell => (p === 39 ? { position: 39, cellType: "finish", config: {} } : every("bonus")(p));
    const s = season({ cellAt: finish, registry: registryOf(GUST) });
    s.player("a").position = 34;
    await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect(s.player("a")).toMatchObject({ position: 39, status: "finished" });
  });

  it("«Погоня» moves the nearest rival behind; with nobody behind the wheel does not offer it", async () => {
    const s = season({ cellAt: every("penalty"), registry: registryOf(PURSUIT) });
    // «a» lands on 12 with «b» ahead on 20: nobody to move.
    const first = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect(first.wheel?.kind).not.toBe("effect");
    expect(s.player("a").position).toBe(12);
    // «b» lands on 22 with «a» behind on 12: «a» closes half the gap.
    const second = await s.turn({ player: "b", outcome: "passed", dice: face(2), spin: true });
    expect(second.wheel).toMatchObject({ kind: "effect", key: "pursuit" });
    expect(s.player("a").position).toBe(17);
    expect(s.player("b").position).toBe(22);
  });
});

describe("simSeason — cursed and passive items (spec §6.10)", () => {
  const item = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    rules: [],
    ...over,
  });
  const BOOTS = item("boots", {
    character: "penalty",
    usage: { activation: "cursed", charges: 1 },
    rules: [{ when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: -2 }] }],
  });
  const CROWN = item("crown", { usage: { activation: "passive" }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }] });
  const registryOf = (...docs: EntryDoc[]) =>
    buildRegistry(compileSet(docs.map((doc, i) => ({ entryId: `0000000${i}-0000-4000-8000-0000000000c${i}`, revisionId: `rev-${doc.slug}`, doc }))));

  it("a cursed item bites its holder's next passed roll, then vanishes", async () => {
    const s = season({ registry: registryOf(BOOTS) });
    await s.give("boots", "a");
    // A drop does not set it off: the rule waits for a pass.
    const drop = await s.turn({ player: "a", outcome: "dropped", dice: face(3), spin: false });
    expect(drop.played.movedTo - drop.from).toBe(-6);
    expect(await s.holdings("a")).toHaveLength(1);
    const pass = await s.turn({ player: "a", outcome: "passed", dice: face(5), spin: false });
    expect(pass.played.movedTo - pass.from).toBe(3);
    expect(await s.holdings("a")).toEqual([]);
    expect(pass.journal.map((j) => j.op)).toEqual(["fire", "tick", "end"]);
  });

  it("a cursed item planted on a player with a game in flight waits for the game after it", async () => {
    const s = season({ registry: registryOf(BOOTS) });
    s.player("b").inFlight = true;
    await s.give("boots", "b");
    const inFlight = await s.turn({ player: "b", outcome: "passed", dice: face(5), spin: false });
    expect(inFlight.played.movedTo - inFlight.from).toBe(5);
    const next = await s.turn({ player: "b", outcome: "passed", dice: face(5), spin: false });
    expect(next.played.movedTo - next.from).toBe(3);
  });

  it("a passive item works on every roll while held, and cannot be used", async () => {
    const s = season({ registry: registryOf(CROWN) });
    await s.give("crown", "a");
    for (let i = 0; i < 3; i++) {
      const t = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: false });
      expect(t.played.movedTo - t.from).toBe(3);
    }
    expect(await s.holdings("a")).toHaveLength(1);
    expect((await s.use({ player: "a", item: { entry: "crown" }, target: null })).code).toBe("ieeItemNotUsable");
  });

  it("the wheel does not hand a cursed item to someone who has it, and a full inventory does not stop it", async () => {
    const s = season({ registry: registryOf(BOOTS), cellAt: every("penalty"), config: { ...CONFIG, iee: { ...CONFIG.iee, inventorySize: 1 } } });
    const first = await s.turn({ player: "a", outcome: "passed", dice: face(1), spin: true });
    expect(first.wheel).toMatchObject({ kind: "item", key: "boots" });
    const second = await s.turn({ player: "a", outcome: "passed", dice: face(1), spin: true });
    expect(second.wheel?.kind).not.toBe("item");
    expect(await s.holdings("a")).toHaveLength(0);
  });
});

describe("simSeason — standing, items held, the chosen player's last roll (wave A)", () => {
  const doc = (kind: "item" | "effect", slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind,
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    rules: [],
    ...(kind === "effect" ? { duration: { unit: "rolls" as const, count: 1 }, stacking: { mode: "refresh" as const } } : {}),
    ...over,
  });
  const PULL_ID = "00000000-0000-4000-8000-0000000000e1";
  // «Магнит»: aimed at a player ahead, it leaves its user an effect that compares their next roll with the target's last.
  const PULL = doc("effect", "pull", {
    rules: [{ when: "afterMovement", if: [{ op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" }], do: [{ op: "steps", delta: 2 }] }],
  });
  const MAGNET = doc("item", "magnet", {
    usage: { activation: "active", charges: 1, target: { who: "other", filter: "ahead" } },
    rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: PULL_ID }, to: "self" }] }],
  });
  const BURDEN = doc("effect", "burden", {
    character: "penalty",
    duration: { unit: "next_game" },
    rules: [{ when: "afterDice", do: [{ op: "resultModify", delta: { source: "itemCount", multiplier: -1 } }] }],
  });
  const registry = () =>
    buildRegistry(
      compileSet([
        { entryId: PULL_ID, revisionId: "rev-pull", doc: PULL },
        { entryId: "00000000-0000-4000-8000-0000000000e2", revisionId: "rev-magnet", doc: MAGNET },
        { entryId: "00000000-0000-4000-8000-0000000000e3", revisionId: "rev-burden", doc: BURDEN },
      ]),
    );

  it("knows each player's place from either end and their last roll", async () => {
    const s = season({ registry: registry() });
    expect(s.snapshot("a")).toMatchObject({ rank: 2, behind: 0, lastRoll: null });
    expect(s.snapshot("b")).toMatchObject({ rank: 1, behind: 1 });
    await s.turn({ player: "b", outcome: "passed", dice: face(4), spin: false });
    expect(s.snapshot("b").lastRoll).toBe(4);
  });

  it("«Магнит»: the effect sees the player its item was aimed at — their last roll as it is when the holder rolls", async () => {
    const s = season({ registry: registry() });
    await s.turn({ player: "b", outcome: "passed", dice: face(5), spin: false });
    await s.give("magnet", "a");
    const used = await s.use({ player: "a", item: { entry: "magnet" }, target: "b" });
    expect(used.ok).toBe(true);
    expect((await s.holdings("a"))[0]).toMatchObject({ kind: "effect", aimedPlayerId: "b" });
    // 3 is lower than their 5: two cells more.
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(3), spin: false });
    expect(t.played.movedTo - t.from).toBe(5);
  });

  it("«Магнит» does nothing when the roll is not lower, and cannot be aimed at a player behind", async () => {
    const s = season({ registry: registry() });
    await s.turn({ player: "b", outcome: "passed", dice: face(2), spin: false });
    await s.give("magnet", "a");
    await s.use({ player: "a", item: { entry: "magnet" }, target: "b" });
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(3), spin: false });
    expect(t.played.movedTo - t.from).toBe(3);
    const behind = season({ registry: registry() });
    await behind.give("magnet", "b");
    expect((await behind.use({ player: "b", item: { entry: "magnet" }, target: "a" })).code).toBe("ieeTargetNotEligible");
  });

  it("«Бремя»: 1 off the next roll for each item held, never below 1 — then gone, passed or dropped", async () => {
    const s = season({ registry: registry() });
    await s.give("magnet", "a");
    await s.give("magnet", "a");
    await s.give("burden", "a");
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(5), spin: false });
    expect(t.played.movedTo - t.from).toBe(3);
    expect((await s.holdings("a")).filter((r) => r.kind === "effect")).toEqual([]);
  });
});

describe("simSeason — item operations through the item path and the turn (wave B, spec §6.12)", () => {
  const item = (slug: string, over: Partial<EntryDoc> = {}): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    usage: { activation: "active", charges: 1, target: { who: "self" } },
    rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }],
    ...over,
  });
  const DOCS: EntryDoc[] = [
    item("joker", { rarity: "rare", rules: [{ when: "onUse", do: [{ op: "grantChosen", rarity: ["common"], activation: "active" }] }] }),
    item("stone", {
      rarity: "rare",
      rules: [
        {
          when: "onUse",
          do: [
            { op: "remove", what: "item", character: "bonus", rarity: ["common"], pick: "choice" },
            { op: "grantChosen", rarity: ["common"] },
          ],
        },
      ],
    }),
    item("glove", { rarity: "epic", usage: { activation: "active", charges: 1, target: { who: "other" } }, rules: [{ when: "onUse", do: [{ op: "stealItem" }] }] }),
    item("boots"),
    item("relic", { rarity: "rare" }),
    item("charm", { usage: { activation: "passive", charges: 1 }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }] }),
    item("curse", { character: "penalty", usage: { activation: "cursed", charges: 1 }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }] }),
    item("off"),
    item("lone", { usage: { activation: "active", charges: 1, unique: true, target: { who: "self" } } }),
    {
      dslVersion: 1,
      kind: "effect",
      slug: "treasure",
      name: { ru: "treasure" },
      character: "bonus",
      rarity: "common",
      tags: [],
      duration: { unit: "moves", count: 1 },
      stacking: { mode: "refresh" },
      rules: [{ when: "afterCellEffect", if: [{ op: "cellType", in: ["bonus"] }], do: [{ op: "extraSpin", pool: "bonus" }] }],
    },
  ];
  /** The season attaches every one; what is switched on drops from the wheel. */
  const registryOf = (on: readonly string[]) => {
    const set = compileSet(DOCS.map((doc, i) => ({ entryId: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, revisionId: `rev-${doc.slug}`, doc })));
    return buildRegistry(set, set.entries.map((e) => defaultCatalogEntry(e, { enabled: on.includes(e.key) })));
  };
  const ON = ["joker", "stone", "glove", "boots", "relic", "charm", "curse", "lone"];
  const keys = async (s: ReturnType<typeof season>, who: string) => (await s.holdings(who)).map((r) => s.registry.get(r.revisionId)!.key).sort();

  it("a pick from the catalog: of what the wheel hands out, bonus, of the rarities and activation asked, never itself", async () => {
    const s = season({ registry: registryOf(ON) });
    const joker = s.registry.item("joker")!;
    expect(entryChoiceOptions(joker.usage.entryChoice!, s.registry, joker).map((e) => e.key).sort()).toEqual(["boots", "lone"]);
    await s.give("joker", "a");
    expect((await s.use({ player: "a", item: { entry: "joker" }, target: null })).code).toBe("ieeEntryChoiceRequired");
    for (const wrong of ["off", "charm", "relic", "curse", "joker", "ghost"]) {
      expect((await s.use({ player: "a", item: { entry: "joker" }, target: null, entryChoice: wrong })).code).toBe("ieeEntryChoiceInvalid");
    }
    const used = await s.use({ player: "a", item: { entry: "joker" }, target: null, entryChoice: s.registry.get("boots")!.entryId });
    expect(used.ok).toBe(true);
    expect(await keys(s, "a")).toEqual(["boots"]);
  });

  it("the stone: a common bonus item of the user's own turns into one of the catalog", async () => {
    const s = season({ registry: registryOf(ON) });
    await s.give("stone", "a");
    await s.give("boots", "a");
    await s.give("relic", "a");
    const mine = async (key: string) => (await s.holdings("a")).find((r) => s.registry.get(r.revisionId)!.key === key)!.id;
    // A rare one is not the stone's to turn.
    expect((await s.use({ player: "a", item: { entry: "stone" }, target: null, choice: await mine("relic"), entryChoice: "lone" })).code).toBe(
      "ieeChoiceInvalid",
    );
    const used = await s.use({ player: "a", item: { entry: "stone" }, target: null, choice: await mine("boots"), entryChoice: "lone" });
    expect(used.ok).toBe(true);
    expect(await keys(s, "a")).toEqual(["lone", "relic"]);
  });

  it("a steal through the item path takes the chosen player's item; the glove is spent", async () => {
    const s = season({ registry: registryOf(ON) });
    await s.give("glove", "a");
    await s.give("relic", "b");
    await s.give("curse", "b");
    const used = await s.use({ player: "a", item: { entry: "glove" }, target: "b" });
    expect(used.ok).toBe(true);
    expect(await keys(s, "a")).toEqual(["relic"]);
    expect(await keys(s, "b")).toEqual(["curse"]);
    expect(used.journal.map((j) => j.op)).toEqual(["use", "move"]);
  });

  it("the wheel spins once more where a rule asks, seeing what the first spin handed out", async () => {
    const s = season({ registry: registryOf(["lone"]), cellAt: every("bonus") });
    await s.give("treasure", "a");
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect(t.played.extraWheels).toEqual(["positive"]);
    expect(t.wheel).toMatchObject({ kind: "item", key: "lone" });
    // The one entry on the wheel is unique and now held: the spin after it cannot hand it out again.
    expect(t.extraWheels).toHaveLength(1);
    expect(t.extraWheels[0]!.key).not.toBe("lone");
    expect(await keys(s, "a")).toEqual(["lone"]);
    // Without the rule, one spin.
    const plain = await s.turn({ player: "b", outcome: "passed", dice: face(2), spin: true });
    expect(plain.extraWheels).toEqual([]);
  });

  it("a second spin of a wheel with room hands out a second drop", async () => {
    const s = season({ registry: registryOf(["boots"]), cellAt: every("bonus") });
    await s.give("treasure", "a");
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect([t.wheel?.key, t.extraWheels[0]?.key]).toEqual(["boots", "boots"]);
    expect(await keys(s, "a")).toEqual(["boots", "boots"]);
  });
});

describe("simSeason — what arrives, and what holds, through the item path and the turn (wave B, spec §6.13)", () => {
  const doc = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "penalty",
    rarity: "common",
    tags: [],
    duration: { unit: "rolls", count: 1 },
    stacking: { mode: "refresh" },
    rules: [],
    ...over,
  });
  const DOCS: EntryDoc[] = [
    doc("veil", { character: "bonus", rules: [{ when: "whileActive", do: [{ op: "untargetable" }] }] }),
    doc("chain", { rules: [{ when: "whileActive", do: [{ op: "forbidItems" }] }] }),
    doc("curse", { duration: { unit: "next_game" }, rules: [{ when: "onIncoming", if: [{ op: "incoming", is: "entry", kind: "item", character: "bonus" }], do: [{ op: "block" }] }] }),
    {
      dslVersion: 1,
      kind: "item",
      slug: "hook",
      name: { ru: "hook" },
      character: "bonus",
      rarity: "common",
      tags: [],
      usage: { activation: "active", charges: 1, target: { who: "other" } },
      rules: [{ when: "onUse", do: [{ op: "move", by: -2, who: "target" }] }],
    },
    {
      dslVersion: 1,
      kind: "item",
      slug: "boots",
      name: { ru: "boots" },
      character: "bonus",
      rarity: "common",
      tags: [],
      usage: { activation: "active", charges: 1, target: { who: "self" } },
      rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }],
    },
  ];
  const registry = () => {
    const set = compileSet(DOCS.map((d, i) => ({ entryId: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`, revisionId: `rev-${d.slug}`, doc: d })));
    // Only the boots drop from the wheel.
    return buildRegistry(set, set.entries.map((e) => defaultCatalogEntry(e, { enabled: e.key === "boots" })));
  };

  it("a rival out of reach refuses the use, and nothing is spent", async () => {
    const s = season({ registry: registry() });
    await s.give("hook", "a");
    await s.give("veil", "b");
    const used = await s.use({ player: "a", item: { entry: "hook" }, target: "b" });
    expect(used).toMatchObject({ ok: false, code: "ieeTargetUntargetable" });
    expect((await s.holdings("a")).map((r) => r.chargesLeft)).toEqual([1]);
    expect(s.player("b").position).toBe(20);
  });

  it("a player kept from their items cannot use them — until the effect runs out", async () => {
    const s = season({ registry: registry() });
    await s.give("boots", "a");
    await s.give("chain", "a", { anchor: { anchorRollSeq: 4 } });
    expect((await s.use({ player: "a", item: { entry: "boots" }, target: null })).code).toBe("ieeItemsForbidden");
    await s.turn({ player: "a", outcome: "passed", dice: face(1), spin: false });
    expect((await s.use({ player: "a", item: { entry: "boots" }, target: null })).ok).toBe(true);
  });

  it("a drop the player's entries block: the wheel shows what it landed on, the player gets nothing", async () => {
    const s = season({ registry: registry(), cellAt: every("bonus") });
    await s.give("curse", "a");
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: true });
    expect(t.wheel).toMatchObject({ kind: "item", key: "boots" });
    expect((await s.holdings("a")).map((r) => s.registry.get(r.revisionId)!.key)).toEqual([]);
    expect(t.journal.map((j) => j.op)).toContain("block");
  });
});

describe("simSeason — the reaction window (wave B, spec §7.4)", () => {
  const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });
  const reactionItem = (slug: string, act: Record<string, unknown>): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: names(slug),
    character: "bonus",
    rarity: "common",
    tags: [],
    usage: { activation: "active", charges: 1, window: "after_dice" },
    rules: [{ when: "onUse", do: [act as EntryDoc["rules"][number]["do"][number]] }],
  });
  const chain: EntryDoc = {
    dslVersion: 1,
    kind: "effect",
    slug: "chain",
    name: names("chain"),
    character: "penalty",
    rarity: "common",
    tags: [],
    duration: { unit: "rolls", count: 1 },
    stacking: { mode: "refresh" },
    rules: [{ when: "whileActive", do: [{ op: "forbidItems" }] }],
  };
  const registry = () =>
    buildRegistry(
      compileSet(
        [reactionItem("coin", { op: "reroll" }), reactionItem("ones", { op: "rerollOn", values: [1] }), chain].map((doc, i) => ({
          entryId: ID(1 + i),
          revisionId: ID(100 + i),
          doc,
        })),
      ),
    );
  /** Dice showing these faces, draw by draw; the last repeats. */
  const faces = (...shown: number[]) => (dice: { sides: number }) => {
    let i = 0;
    return () => (shown[Math.min(i++, shown.length - 1)]! - 0.5) / dice.sides;
  };

  it("opens for a reaction item the throw offers; the item used throws again, its charge spent, all journaled", async () => {
    const s = season({ registry: registry() });
    const coin = (await s.give("coin", "a")).instanceId!;
    const seen: unknown[] = [];
    const t = await s.turn({
      player: "a",
      outcome: "passed",
      dice: faces(2, 6),
      spin: false,
      react: ({ view, offers }) => {
        seen.push({ faces: [...view.faces], offers: offers.map((o) => o.key) });
        return offers[0]!.instanceId;
      },
    });
    expect(seen).toEqual([{ faces: [2], offers: ["coin"] }]);
    expect(t.window).toBe("used");
    expect(t.played.reaction).toEqual({ before: [2], thrown: [[6]], after: [6], result: { before: 2, after: 6 } });
    expect(t.played.movedTo - t.from).toBe(6);
    expect(t.journal.map((j) => j.op)).toEqual(["decision_open", "use", "decision_resolve"]);
    expect(t.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ outcome: { option: "react", picks: [coin], before: [2], after: [6] } });
    expect((await s.holdings("a")).some((r) => r.id === coin)).toBe(false);
    expect(s.store.decisions).toEqual([expect.objectContaining({ kind: "reaction_window", status: "resolved" })]);
  });

  it("accepted: the throw stands, nothing is spent", async () => {
    const s = season({ registry: registry() });
    await s.give("coin", "a");
    const t = await s.turn({ player: "a", outcome: "passed", dice: faces(2), spin: false });
    expect(t.window).toBe("accepted");
    expect(t.played.reaction).toBeNull();
    expect(t.played.movedTo - t.from).toBe(2);
    expect(t.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ outcome: { option: "accept" } });
    expect(await s.holdings("a")).toHaveLength(1);
  });

  it("does not open when nothing would change, without a reaction item, or while the player is kept from items", async () => {
    // A 1 to throw again, and no 1 showing.
    const s = season({ registry: registry() });
    await s.give("ones", "a");
    expect((await s.turn({ player: "a", outcome: "passed", dice: faces(4), spin: false })).window).toBe("none");
    expect((await s.turn({ player: "b", outcome: "passed", dice: faces(1), spin: false })).window).toBe("none");
    const kept = season({ registry: registry() });
    await kept.give("coin", "a");
    await kept.give("chain", "a");
    expect((await kept.turn({ player: "a", outcome: "passed", dice: faces(1), spin: false })).window).toBe("none");
    expect(kept.store.decisions).toEqual([]);
  });
});

describe("simSeason — the next game (wave C, spec §6.16, §7.12)", () => {
  const ID = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;
  const effect = (slug: string, rules: EntryDoc["rules"]): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    duration: { unit: "next_game" },
    stacking: { mode: "refresh" },
    rules,
  });
  const item = (slug: string, usage: NonNullable<EntryDoc["usage"]>, rules: EntryDoc["rules"]): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "bonus",
    rarity: "rare",
    tags: [],
    usage,
    rules,
  });
  const onOpenRoll = { activation: "active", window: "on_open_roll", charges: 1, target: { who: "self" } } as const;
  const DOCS: EntryDoc[] = [
    effect("doors", [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 3 }] }]),
    effect("ticket_effect", [{ when: "beforeGameRoll", do: [{ op: "poolRequire", genres: "picked" }] }]),
    item("ticket", { activation: "active", charges: 1, target: { who: "self" }, pick: "genre" }, [
      { when: "onUse", do: [{ op: "grantEffect", entry: { entry: ID(1) }, to: "self" }] },
    ]),
    item("game_reroll", onOpenRoll, [{ when: "onUse", do: [{ op: "rerollGame" }] }]),
    item("postponed", onOpenRoll, [{ when: "onUse", do: [{ op: "postponeGame", afterRolls: 2 }] }]),
  ];
  const registry = () => buildRegistry(compileSet(DOCS.map((d, i) => ({ entryId: ID(i), revisionId: `rev-${d.slug}`, doc: d }))));
  const g = (key: string) => scenarioGame(key)!.id;
  const titleOf = (s: ReturnType<typeof season>, id: string) => s.player(id).game && s.game(s.player(id).game!)?.title;
  const pooled = (over: Partial<SimSeasonInput> = {}) => season({ registry: registry(), games: SCENARIO_GAMES, ...over });

  it("draws the first game left in the pool's order, never one the player has had; a game in flight refuses a draw", async () => {
    const s = pooled({ players: [{ id: "a", rollSeq: 4, passed: [g("starfall")] }] });
    expect(await s.draw({ player: "a" })).toMatchObject({ result: "drawn", code: null, journal: [] });
    expect(titleOf(s, "a")).toBe("Old Keep");
    expect(s.player("a").inFlight).toBe(true);
    expect(await s.draw({ player: "a" })).toMatchObject({ result: "refused", code: "gameAlreadyHaveRoll" });
    // The game reported: a pass is one more game passed, and the next draw goes on from there.
    await s.turn({ player: "a", outcome: "passed", dice: face(3), spin: false });
    expect(s.player("a")).toMatchObject({ game: null, inFlight: false, passed: [g("starfall"), g("old_keep")] });
    await s.draw({ player: "a" });
    expect(titleOf(s, "a")).toBe("Quiet House");
    // A drop is not a pass.
    await s.turn({ player: "a", outcome: "dropped", dice: face(3), spin: false });
    expect(s.player("a").passed).toEqual([g("starfall"), g("old_keep")]);
  });

  it("high draws take the last game left; with nothing left the draw is refused", async () => {
    const high = pooled({ rng: () => 0.999_999 });
    await high.draw({ player: "a" });
    expect(titleOf(high, "a")).toBe("Sky Garden");
    const empty = pooled({ games: SCENARIO_GAMES.slice(0, 1), players: [{ id: "a", passed: [g("starfall")] }] });
    expect(await empty.draw({ player: "a" })).toMatchObject({ result: "refused", code: "catalogAllPlayed" });
    expect(await pooled({ games: [] }).draw({ player: "a" })).toMatchObject({ result: "refused", code: "catalogAllPlayed" });
  });

  it("a choice of three waits for the player: no game in flight, a second draw refused, a game not offered refused", async () => {
    const s = pooled();
    await s.give("doors", "a");
    const drawn = await s.draw({ player: "a" });
    expect(drawn.result).toBe("choosing");
    expect(drawn.journal.map((j) => j.op)).toEqual(["decision_open", "pool"]);
    expect(drawn.journal[1]).toMatchObject({ outcome: { offered: [g("starfall"), g("old_keep"), g("quiet_house")], relaxed: false } });
    expect(await s.offered("a")).toBe(3);
    expect(s.player("a")).toMatchObject({ game: null, inFlight: false });
    expect(await s.draw({ player: "a" })).toMatchObject({ result: "refused", code: "ieeDecisionPending" });
    // Kept from using items while it waits, as every decision keeps them.
    await s.give("ticket", "a");
    expect(await s.use({ player: "a", item: { entry: "ticket" }, target: null, pick: { genre: "rpg" } })).toMatchObject({ ok: false, code: "ieeDecisionPending" });
    expect(await s.takeGame({ player: "a", gameId: g("sky_garden") })).toMatchObject({ ok: false, code: "ieeDecisionChoiceInvalid" });
    const taken = await s.takeGame({ player: "a", gameId: g("old_keep") });
    expect(taken).toMatchObject({ ok: true, code: null });
    expect(taken.journal.map((j) => j.op)).toEqual(["decision_resolve"]);
    expect(s.player("a")).toMatchObject({ game: g("old_keep"), inFlight: true });
    expect(await s.offered("a")).toBe(0);
    expect(await s.takeGame({ player: "a", gameId: g("starfall") })).toMatchObject({ ok: false, code: "ieeDecisionNotFound" });
  });

  it("a draw names the game to take: taken at once; one the choice does not offer leaves it waiting", async () => {
    const s = pooled();
    await s.give("doors", "a");
    expect(await s.draw({ player: "a", take: g("quiet_house") })).toMatchObject({ result: "drawn" });
    expect(titleOf(s, "a")).toBe("Quiet House");
    const t = pooled();
    await t.give("doors", "a");
    expect(await t.draw({ player: "a", take: g("sky_garden") })).toMatchObject({ result: "choosing" });
    expect(await t.offered("a")).toBe(3);
  });

  it("a pick for the next game: what the pool offers is what is left, and the genre picked is the one drawn", async () => {
    const s = pooled({ players: [{ id: "a", rollSeq: 4, passed: [g("quiet_house")] }] });
    expect(await s.pickOptions("a", "genre")).toEqual(
      ["action", "adventure", "horror", "platformer", "puzzle", "racing", "rpg", "shooter", "strategy"].map((genre) => ({ genre })),
    );
    expect(await s.pickOptions("a", "years")).toEqual([1990, 2000, 2010, 2020].map((from) => ({ years: [from, from + 9] })));
    expect(await s.pickOptions("a", "game")).toHaveLength(7);
    expect((await s.pickOptions("a", "game"))[0]).toEqual({ gameId: g("starfall"), title: "Starfall" });
    await s.give("ticket", "a");
    expect(await s.use({ player: "a", item: { entry: "ticket" }, target: null, pick: { genre: "jazz" } })).toMatchObject({ ok: false, code: "ieePickInvalid" });
    expect(await s.use({ player: "a", item: { entry: "ticket" }, target: null })).toMatchObject({ ok: false, code: "ieePickRequired" });
    expect(await s.use({ player: "a", item: { entry: "ticket" }, target: null, pick: { genre: "Horror" } })).toMatchObject({ ok: true });
    const drawn = await s.draw({ player: "a" });
    // Quiet House is had: the other horror game.
    expect(titleOf(s, "a")).toBe("Night Shift");
    expect(drawn.journal.map((j) => j.op)).toEqual(["pool"]);
  });

  it("a reroll replaces the game in flight with the next one drawn; with nothing left it is refused and nothing is spent", async () => {
    const s = pooled({ players: [{ id: "a", rollSeq: 4, game: g("starfall"), inFlight: true }] });
    await s.give("game_reroll", "a");
    const used = await s.use({ player: "a", item: { entry: "game_reroll" }, target: null });
    expect(used).toMatchObject({ ok: true, code: null });
    expect(s.player("a")).toMatchObject({ game: g("old_keep"), inFlight: true, aside: [] });
    expect(s.player("a").had).toEqual([g("starfall"), g("old_keep")]);
    // Without a game in flight the window is closed.
    const idle = pooled();
    await idle.give("game_reroll", "a");
    expect(await idle.use({ player: "a", item: { entry: "game_reroll" }, target: null })).toMatchObject({ ok: false, code: "ieeItemWrongWindow" });
    const last = pooled({ games: SCENARIO_GAMES.slice(0, 1), players: [{ id: "a", game: g("starfall"), inFlight: true }] });
    await last.give("game_reroll", "a");
    expect(await last.use({ player: "a", item: { entry: "game_reroll" }, target: null })).toMatchObject({ ok: false, code: "catalogAllPlayed" });
    expect((await last.holdings("a")).map((r) => r.chargesLeft)).toEqual([1]);
    expect(last.player("a").game).toBe(g("starfall"));
  });

  it("set aside: a new game now, and the game comes back as the player's game two picks later — no draw, no rules", async () => {
    const s = pooled({ players: [{ id: "a", rollSeq: 4, game: g("starfall"), inFlight: true }] });
    await s.give("postponed", "a");
    expect(await s.use({ player: "a", item: { entry: "postponed" }, target: null })).toMatchObject({ ok: true });
    expect(s.player("a")).toMatchObject({ game: g("old_keep"), aside: [{ gameId: g("starfall"), until: 5 }] });
    await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: false });
    await s.give("doors", "a");
    const back = await s.draw({ player: "a" });
    expect(back).toMatchObject({ result: "drawn", journal: [] });
    expect(s.player("a")).toMatchObject({ game: g("starfall"), inFlight: true, aside: [] });
    expect(await s.offered("a")).toBe(0);
  });

  it("a reroll under a choice of three offers the choice; the game the use names is taken", async () => {
    const s = pooled();
    await s.give("doors", "a");
    await s.draw({ player: "a", take: g("starfall") });
    await s.give("game_reroll", "a");
    const used = await s.use({ player: "a", item: { entry: "game_reroll" }, target: null, take: g("gear_run") });
    expect(used.ok).toBe(true);
    expect(used.journal.map((j) => j.op)).toEqual(["use", "decision_open", "pool", "decision_resolve"]);
    expect(used.journal[1]).toMatchObject({ intent: { kind: "game_choice", origin: "reroll", item: "game_reroll" } });
    expect(s.player("a").game).toBe(g("gear_run"));
  });
});

describe("simSeason — completion conditions (wave C, spec §6.17)", () => {
  const ID = (n: number) => `00000000-0000-4000-8000-0000000004${String(n).padStart(2, "0")}`;
  const effect = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug,
    name: { ru: slug, en: slug, uk: slug },
    character: "penalty",
    rarity: "common",
    tags: ["game_condition"],
    duration: { unit: "rolls", count: 3 },
    stacking: { mode: "refresh" },
    rules: [],
    ...over,
  });
  const HARD = { ru: "На высокой сложности" };
  const DOCS: EntryDoc[] = [
    effect("hard", { rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: HARD }] }] }),
    effect("free", { character: "bonus", tags: [], rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] }),
    effect("doors", { character: "bonus", tags: [], rules: [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 2 }] }] }),
    {
      dslVersion: 1,
      kind: "item",
      slug: "game_reroll",
      name: { ru: "game_reroll" },
      character: "bonus",
      rarity: "rare",
      tags: [],
      usage: { activation: "active", window: "on_open_roll", charges: 1, target: { who: "self" } },
      rules: [{ when: "onUse", do: [{ op: "rerollGame" }] }],
    },
  ];
  const registry = () => buildRegistry(compileSet(DOCS.map((d, i) => ({ entryId: ID(i), revisionId: `rev-${d.slug}`, doc: d }))));
  const pooled = () => season({ registry: registry(), games: SCENARIO_GAMES });
  const texts = async (s: ReturnType<typeof season>, id = "a") => (await s.conditions(id)).map((c) => c.text);

  it("a game drawn gets the conditions its holder's rules give; the game reported ends them", async () => {
    const s = pooled();
    await s.give("hard", "a");
    const drawn = await s.draw({ player: "a" });
    expect(await texts(s)).toEqual([HARD]);
    expect(drawn.journal.map((j) => j.op)).toEqual(["grant"]);
    const t = await s.turn({ player: "a", outcome: "passed", dice: face(2), spin: false });
    expect(await texts(s)).toEqual([]);
    expect(t.journal.filter((j) => j.op === "expire").map((j) => j.outcome)).toContainEqual({ reason: "roll_ended", rollId: expect.any(String) });
    // The wheel never counts a condition as a drop of the entry that added it.
    expect(s.store.instances.filter((i) => i.kind === "roll_condition")).toHaveLength(1);
  });

  it("a game taken from a choice gets them as it is taken, not while the choice waits", async () => {
    const s = pooled();
    await s.give("hard", "a");
    await s.give("doors", "a");
    expect(await s.draw({ player: "a" })).toMatchObject({ result: "choosing" });
    expect(await texts(s)).toEqual([]);
    await s.takeGame({ player: "a", gameId: scenarioGame("old_keep")!.id });
    expect(await texts(s)).toEqual([HARD]);
  });

  it("a reroll ends the old game's and gives the new game its own", async () => {
    const s = pooled();
    await s.give("hard", "a");
    await s.draw({ player: "a" });
    const first = s.player("a").roll;
    await s.give("game_reroll", "a");
    expect((await s.use({ player: "a", item: { entry: "game_reroll" }, target: null })).ok).toBe(true);
    expect(s.player("a").roll).not.toBe(first);
    expect(await texts(s)).toEqual([HARD]);
    expect(await s.store.store.activeForRoll(first!)).toEqual([]);
  });

  it("an immunity keeps them off — and a game given in flight before the season holds none", async () => {
    const s = pooled();
    await s.give("hard", "a");
    await s.give("free", "a");
    await s.draw({ player: "a" });
    expect(await texts(s)).toEqual([]);
    expect(s.store.journal.filter((j) => j.op === "noop").map((j) => j.outcome)).toEqual([{ reason: "immune" }]);
    const given = season({ registry: registry(), games: SCENARIO_GAMES, players: [{ id: "a", game: scenarioGame("starfall")!.id, inFlight: true }] });
    await given.give("hard", "a");
    expect(await texts(given)).toEqual([]);
  });
});
