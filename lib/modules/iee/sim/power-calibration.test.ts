/**
 * The power estimate, held to the simulator (docs/IEE_CONSTRUCTOR_SPEC.md §14).
 *
 * `entryPower` reckons an entry's worth from its rules with the costs of
 * `lib/engine/iee/dsl/play-model.ts`; `measureEntry` plays it — every seed
 * with and without it, on the same dice, games and wheel draws. This file is
 * where the two must agree: each primitive on its own, then every `core`
 * entry. A change to a cost that the simulator does not bear out fails here;
 * so does a change to the game that leaves the costs behind.
 */
import { describe, expect, it, vi } from "vitest";

import { HANDOUT_TAG, RARITY_WEIGHT } from "@/lib/engine";
import { CORE_DOCS, CORE_ENTRY_IDS } from "@/lib/engine/iee/core-docs";
import {
  ACTIONS,
  ANY_PLAY,
  CELL_SHARE,
  PLAY_MODEL,
  RARITIES,
  aboveRarity,
  actionDef,
  entryPower,
  heldItemWorth,
  isActionOp,
  powerTable,
  type ActionDoc,
  type EntryDoc,
} from "@/lib/engine/iee/dsl";

import { measureEntry, type Measured } from "./measure";

// Thousands of simulated turns per case: slower than a unit test, and meant to be.
vi.setConfig({ testTimeout: 60_000 });

const CORE = new Map(CORE_DOCS.map((d) => [d.entryId, d.doc]));
// What drops: a handout plays only when its item hands it out (spec §6.6).
const WHEELS = CORE_DOCS.filter(({ doc }) => !doc.tags.includes(HANDOUT_TAG)).map(({ entryId, doc }) => ({ entryId, doc }));
const POWER = powerTable(new Map(CORE));
const SEEDS = 300;
const SYNTH = "88888888-8888-4888-8888-888888888888";

/** Within what the model and 300 seeds allow: half a cell, a third of the value, two standard errors. */
function agrees(power: number, measured: Measured): boolean {
  const size = Math.abs(measured.value);
  return Math.abs(power - size) <= 0.5 + 0.35 * size + 2 * measured.error;
}

const effect = (slug: string, rules: EntryDoc["rules"], duration: EntryDoc["duration"]): EntryDoc => ({
  dslVersion: 1,
  kind: "effect",
  slug: `calibrate_${slug}`,
  name: { ru: slug },
  character: "bonus",
  rarity: "legendary",
  tags: ["movement"],
  duration,
  stacking: { mode: "refresh" },
  rules,
});

const item = (slug: string, who: "self" | "other", rules: EntryDoc["rules"]): EntryDoc => ({
  dslVersion: 1,
  kind: "item",
  slug: `calibrate_${slug}`,
  name: { ru: slug },
  character: "bonus",
  rarity: "legendary",
  tags: ["movement"],
  usage: { activation: "active", charges: 1, target: { who } },
  rules,
});

/** A passive or cursed item: it works by itself while held, firing a number of times (spec §6.10). */
const held = (slug: string, activation: "passive" | "cursed", charges: number, rules: EntryDoc["rules"]): EntryDoc => ({
  ...item(slug, "self", rules),
  character: activation === "cursed" ? "penalty" : "bonus",
  usage: { activation, charges },
});

/**
 * Turns enough for the entry to have done its work: an effect that waits for
 * its trigger waits longer, and so does an item held with charges — it spends
 * one on each turn a rule fires.
 */
const turnsFor = (doc: EntryDoc) =>
  (doc.kind === "effect" && doc.duration?.unit === "triggers") || (doc.kind === "item" && doc.usage?.activation !== "active" && doc.usage?.charges != null)
    ? 30
    : 12;

type Placing = Parameters<typeof measureEntry>[0]["placing"];

async function measure(entryId: string, doc: EntryDoc, placing?: Placing, carries: readonly string[] = []): Promise<Measured> {
  const m = await measureEntry(
    { entryId, doc, docOf: (id) => CORE.get(id) ?? null, wheels: WHEELS, carries, ...(placing ? { placing } : {}) },
    { seeds: SEEDS, turns: turnsFor(doc) },
  );
  if (!m) throw new Error(`${doc.slug} does not compile`);
  return m;
}

describe("power — each primitive, against what it does in play", () => {
  const cases: [string, EntryDoc][] = [
    ["a cell longer, two moves", effect("steps", [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }], { unit: "moves", count: 2 })],
    ["two cells shorter, one roll", effect("short", [{ when: "afterMovement", do: [{ op: "steps", delta: -2 }] }], { unit: "rolls", count: 1 })],
    ["a die more, three rolls", effect("die", [{ when: "beforeMovement", do: [{ op: "dice", count: 1 }] }], { unit: "rolls", count: 3 })],
    ["two sides more, two rolls", effect("sides", [{ when: "beforeMovement", do: [{ op: "dice", sides: 2 }] }], { unit: "rolls", count: 2 })],
    ["two sides fewer, three rolls", effect("fewer", [{ when: "beforeMovement", do: [{ op: "dice", sides: -2 }] }], { unit: "rolls", count: 3 })],
    [
      "two points on a pass, three rolls",
      effect("points", [{ when: "onOutcome", if: [{ op: "outcome", is: "passed" }], do: [{ op: "balance", amount: 2 }] }], { unit: "rolls", count: 3 }),
    ],
    ["a point lost on every cell, three moves", effect("toll", [{ when: "afterCellEffect", do: [{ op: "balance", amount: -1 }] }], { unit: "moves", count: 3 })],
    ["no move, one roll", effect("stay", [{ when: "afterMovement", do: [{ op: "noMove" }] }], { unit: "rolls", count: 1 })],
    [
      "no move on a pass, three rolls",
      effect("stuck", [{ when: "afterMovement", if: [{ op: "outcome", is: "passed" }], do: [{ op: "noMove" }] }], { unit: "rolls", count: 3 }),
    ],
    [
      "no move on a drop, three rolls",
      effect("anchor", [{ when: "afterMovement", if: [{ op: "outcome", is: "dropped" }], do: [{ op: "noMove" }] }], { unit: "rolls", count: 3 }),
    ],
    [
      "a penalty cell kept from firing, once",
      effect("ward", [{ when: "beforeCellEffect", if: [{ op: "cellType", in: ["penalty"] }], do: [{ op: "skipCellEffect" }] }], { unit: "triggers", count: 1 }),
    ],
    [
      "a bonus cell kept from firing, once",
      effect("blind", [{ when: "beforeCellEffect", if: [{ op: "cellType", in: ["bonus"] }], do: [{ op: "skipCellEffect" }] }], { unit: "triggers", count: 1 }),
    ],
    // Wave A — the dice pipeline (spec §7.2).
    [
      "a 1 or 2 thrown again on a pass, three rolls",
      effect("reroll", [{ when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "rerollOn", values: [1, 2] }] }], { unit: "rolls", count: 3 }),
    ],
    ["the better of two throws, two rolls", effect("best", [{ when: "afterDice", do: [{ op: "bestOfTwo" }] }], { unit: "rolls", count: 2 })],
    [
      "the worse of two throws on a pass, two passed games",
      effect("worst", [{ when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "worstOfTwo" }] }], { unit: "passed_games", count: 2 }),
    ],
    [
      "two off a pass's result, never below 1, three rolls",
      effect("heavy", [{ when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: -2 }] }], { unit: "rolls", count: 3 }),
    ],
    ["a result capped at 3, two rolls", effect("capped", [{ when: "afterDice", do: [{ op: "resultModify", cap: 3 }] }], { unit: "rolls", count: 2 })],
    [
      "the lower half of a pass going back, two rolls",
      effect("compass", [{ when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "direction", lowerHalf: "back" }] }], { unit: "rolls", count: 2 }),
    ],
    [
      "no move when a pass shows 2 or less, three rolls",
      effect(
        "stall",
        [{ when: "afterMovement", if: [{ op: "outcome", is: "passed" }, { op: "diceShow", of: "sum", cmp: "lte", value: 2 }], do: [{ op: "noMove" }] }],
        { unit: "rolls", count: 3 },
      ),
    ],
  ];

  it.each(cases)("%s", async (_title, doc) => {
    const power = entryPower(doc);
    const measured = await measure(SYNTH, doc);
    expect({ power, measured: Math.round(measured.value * 10) / 10, agrees: agrees(power, measured) }).toMatchObject({ agrees: true });
  });
});

describe("power — out-of-turn moves, against what they do in play (spec §7.3)", () => {
  const instant = (slug: string, rules: EntryDoc["rules"]) => ({ ...effect(slug, rules, { unit: "instant" }), stacking: undefined });
  const CHAOS = { table: { die: 20, rows: [{ upTo: 1, value: -5 }, { upTo: 5, value: -2 }, { upTo: 10, value: 0 }, { upTo: 15, value: 2 }, { upTo: 19, value: 4 }, { upTo: 20, value: 8 }] } };
  // The play model's gaps: a player aimed at stands `aimGap` (6) ahead, the
  // nearest rival behind `behindGap` (4) back; a last move undone was a pass or a drop.
  const cases: [string, EntryDoc, Placing?][] = [
    ["three cells forward at once", item("teleport", "self", [{ when: "onUse", do: [{ op: "move", by: 3 }] }])],
    ["the chosen rival two cells back", item("hook", "other", [{ when: "onUse", do: [{ op: "move", by: -2, who: "target" }] }])],
    ["a d20 table of moves", item("chaos", "self", [{ when: "onUse", do: [{ op: "move", by: CHAOS }] }])],
    ["one to three cells back as it arrives", instant("misfire", [{ when: "onApply", do: [{ op: "move", by: { random: [-3, -1] } }] }])],
    ["onto the chosen player six ahead", item("portal", "other", [{ when: "onUse", do: [{ op: "moveToTarget", at: "cell" }] }]), { rivalAhead: 6 }],
    ["right before the chosen player six ahead", item("ring", "other", [{ when: "onUse", do: [{ op: "moveToTarget", at: "before" }] }]), { rivalAhead: 6 }],
    ["places swapped with the chosen player six ahead", item("swap", "other", [{ when: "onUse", do: [{ op: "swapPositions", with: "target" }] }]), { rivalAhead: 6 }],
    ["the rival four behind closing half the gap", instant("pursuit", [{ when: "onApply", do: [{ op: "halveGap", who: "nearestBehind" }] }]), { rivalAhead: -4 }],
    ["places swapped with the rival four behind", instant("castling", [{ when: "onApply", do: [{ op: "swapPositions", with: "nearestBehind" }] }]), { rivalAhead: -4 }],
    [
      "the chosen player's pass undone",
      item("time_stone", "other", [{ when: "onUse", do: [{ op: "rollbackLastMove", who: "target" }] }]),
      { lastMove: { rival: 4 } },
    ],
    ["your own drop undone", item("rewind", "self", [{ when: "onUse", do: [{ op: "rollbackLastMove", who: "self" }] }]), { lastMove: { holder: -7 } }],
  ];

  it.each(cases)("%s", async (_title, doc, placing) => {
    const power = entryPower(doc);
    const measured = await measure(SYNTH, doc, placing);
    expect({ power, measured: Math.round(measured.value * 10) / 10, agrees: agrees(power, measured) }).toMatchObject({ agrees: true });
  });
});

describe("power — reaction items, against a bot that uses them on a bad throw (wave B, spec §6.15)", () => {
  // Used in the reaction window, on the first bad throw it is expected to improve — the bots' policy (§7.4).
  const reaction = (slug: string, rules: EntryDoc["rules"]): EntryDoc => ({
    ...item(slug, "self", rules),
    usage: { activation: "active", charges: 1, window: "after_dice", target: { who: "self" } },
  });
  const cases: [string, EntryDoc][] = [
    ["the dice thrown again, the new throw standing", reaction("coin", [{ when: "onUse", do: [{ op: "reroll" }] }])],
    ["the better of two throws", reaction("gold", [{ when: "onUse", do: [{ op: "bestOfTwo" }] }])],
    ["one more on the result", reaction("elixir", [{ when: "onUse", do: [{ op: "resultModify", delta: 1 }] }])],
    ["a 1 thrown again", reaction("ones", [{ when: "onUse", do: [{ op: "rerollOn", values: [1] }] }])],
  ];

  it.each(cases)("%s", async (_title, doc) => {
    const power = entryPower(doc);
    const measured = await measure(SYNTH, doc);
    expect({ power, measured: Math.round(measured.value * 10) / 10, agrees: agrees(power, measured) }).toMatchObject({ agrees: true });
  });
});

describe("power — items at work while held, and what a removal takes (spec §6.10)", () => {
  const onPass = { op: "outcome", is: "passed" } as const;
  const cases: [string, EntryDoc, (readonly string[])?][] = [
    [
      "cursed: two off a pass's result, three times",
      held("weights", "cursed", 3, [{ when: "afterDice", if: [onPass], do: [{ op: "resultModify", delta: -2 }] }]),
    ],
    [
      "cursed: two back as it is picked up, then a pass a cell shorter, twice",
      held("anchor", "cursed", 2, [
        { when: "onPickup", do: [{ op: "move", by: -2 }] },
        { when: "afterMovement", if: [onPass], do: [{ op: "steps", delta: -1 }] },
      ]),
    ],
    [
      "passive: a penalty cell kept from firing, twice",
      held("charm", "passive", 2, [{ when: "beforeCellEffect", if: [{ op: "cellType", in: ["penalty"] }], do: [{ op: "skipCellEffect" }] }]),
    ],
    [
      "your newest penalty effect removed, on a poisoned holder",
      item("purge", "self", [{ when: "onUse", do: [{ op: "remove", what: "effect", character: "penalty", pick: "newest" }] }]),
      [CORE_ENTRY_IDS.poison],
    ],
  ];

  it.each(cases)("%s", async (_title, doc, carries) => {
    const power = entryPower(doc);
    const measured = await measure(SYNTH, doc, undefined, carries);
    expect({ power, measured: Math.round(measured.value * 10) / 10, agrees: agrees(power, measured) }).toMatchObject({ agrees: true });
  });
});

describe("power — what the moment knows, and the next game (wave A, spec §6.2, §6.5)", () => {
  const onPass = { op: "outcome", is: "passed" } as const;
  const PULL = "77777777-7777-4777-8777-777777777777";
  // «Магнит»'s effect: on a pass lower than the chosen player's last roll, two cells more.
  const pull = { ...effect("pull", [{ when: "afterMovement", if: [onPass, { op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" }], do: [{ op: "steps", delta: 2 }] }], { unit: "rolls", count: 1 }) };
  const magnet = item("magnet", "other", [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: PULL }, to: "self" }] }]);
  const cases: [string, EntryDoc, Placing?, (readonly string[])?][] = [
    ["a pass's move longer by the dice result, one roll", effect("double", [{ when: "afterMovement", if: [onPass], do: [{ op: "steps", delta: { source: "diceSum" } }] }], { unit: "rolls", count: 1 })],
    // On a pass only: a lower result on a drop is a shorter move back — it would help (session 24).
    [
      "a pass's result 1 lower for each item held, the next game, on a holder with one",
      {
        ...effect("burden", [{ when: "afterDice", if: [onPass], do: [{ op: "resultModify", delta: { source: "itemCount", multiplier: -1 } }] }], { unit: "next_game" }),
        character: "penalty",
      },
      undefined,
      [CORE_ENTRY_IDS.speed_boots],
    ],
    ["no move on a pass, the next game", { ...effect("lost", [{ when: "afterMovement", if: [onPass], do: [{ op: "noMove" }] }], { unit: "next_game" }), character: "penalty" }],
    [
      "forward by the chosen player's last roll of 5",
      item("echo", "other", [{ when: "onUse", do: [{ op: "move", by: { source: "targetLastRoll" } }] }]),
      { rivalAhead: 6, lastRoll: { rival: 5 } },
    ],
  ];

  it.each(cases)("%s", async (_title, doc, placing, carries) => {
    const power = entryPower(doc);
    const measured = await measure(SYNTH, doc, placing, carries);
    expect({ power, measured: Math.round(measured.value * 10) / 10, agrees: agrees(power, measured) }).toMatchObject({ agrees: true });
  });

  it("«Магнит»: a pass lower than the chosen player's last roll of 5, two cells more", async () => {
    const docs = new Map(CORE);
    docs.set(PULL, pull);
    const power = entryPower(magnet, { powerOf: (id) => (id === PULL ? entryPower(pull) : null) });
    const m = await measureEntry(
      { entryId: SYNTH, doc: magnet, docOf: (id) => docs.get(id) ?? null, wheels: WHEELS, placing: { rivalAhead: 6, lastRoll: { rival: 5 } } },
      { seeds: SEEDS, turns: turnsFor(magnet) },
    );
    expect({ power, measured: Math.round(m!.value * 10) / 10, agrees: agrees(power, m!) }).toMatchObject({ agrees: true });
  });
});

describe("power — items changing hands and wheels spun again, against the pack (wave B, spec §6.12)", () => {
  /*
   * The simulator uses the item under test and nothing a run hands out, so
   * what a stolen, copied or chosen item is worth — and what a spin of the
   * bonus wheel is, whose drops are mostly items — is read off the pack: its
   * power, which every core entry has been measured to (below), weighted by
   * how often each drops.
   */
  const PLAYED = CORE_DOCS.filter((d) => !d.doc.tags.includes(HANDOUT_TAG));
  const weight = (d: (typeof PLAYED)[number]) => RARITY_WEIGHT[d.doc.rarity];
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const meanPower = (of: typeof PLAYED) => sum(of.map((d) => weight(d) * POWER.get(d.entryId)!)) / sum(of.map(weight));
  const near = (actual: number, expected: number, tolerance: number) => ({ actual, expected, near: Math.abs(actual - expected) <= tolerance });
  const bonusItems = PLAYED.filter((d) => d.doc.kind === "item" && d.doc.character === "bonus");

  it("a held item of each rarity is worth what the pack's are, at their share of the drops", () => {
    const total = sum(bonusItems.map(weight));
    for (const r of RARITIES) {
      const of = bonusItems.filter((d) => d.doc.rarity === r);
      expect(of.length, `core has a bonus item of rarity ${r}`).toBeGreaterThan(0);
      const plain = sum(of.map((d) => POWER.get(d.entryId)!)) / of.length;
      expect({ rarity: r, ...near(PLAY_MODEL.heldItem[r].worth, plain, 0.1 + 0.1 * plain) }).toMatchObject({ near: true });
      expect({ rarity: r, ...near(PLAY_MODEL.heldItem[r].share, sum(of.map(weight)) / total, 0.01) }).toMatchObject({ near: true });
    }
    expect(near(heldItemWorth(null), meanPower(bonusItems), 0.1)).toMatchObject({ near: true });
  });

  it("a pick of a rarity takes the pack's strongest of it", () => {
    for (const r of RARITIES) {
      const best = Math.max(...bonusItems.filter((d) => d.doc.rarity === r).map((d) => POWER.get(d.entryId)!));
      expect({ rarity: r, best: PLAY_MODEL.bestItem[r] }).toEqual({ rarity: r, best });
    }
  });

  it("a spin is worth what its wheel drops", () => {
    const pool = (character: "bonus" | "penalty") => PLAYED.filter((d) => d.doc.character === character);
    expect(near(PLAY_MODEL.spin.bonus, meanPower(pool("bonus")), 0.15)).toMatchObject({ near: true });
    expect(near(PLAY_MODEL.spin.penalty, -meanPower(pool("penalty")), 0.15)).toMatchObject({ near: true });
  });

  it("the penalty wheel spun once more after every move, three moves, in play", async () => {
    // Its drops are effects and cursed items: the simulator plays all of them.
    const doc = { ...effect("again", [{ when: "afterCellEffect", do: [{ op: "extraSpin", pool: "penalty" }] }], { unit: "moves", count: 3 }), character: "penalty" as const };
    const power = entryPower(doc);
    const measured = await measure(SYNTH, doc);
    expect({ power, measured: Math.round(measured.value * 10) / 10, agrees: agrees(power, measured) }).toMatchObject({ agrees: true });
  });
});

describe("power — what arrives, against the pack (wave B, spec §6.13)", () => {
  /*
   * The simulator plays rivals who use nothing a run hands out, so a block, a
   * reflection or an amplification never meets anything there to answer: what
   * one arrival is worth, and how often one comes, are read off the pack —
   * each entry's power, measured above, at its share of its wheel and of the
   * board's cells.
   */
  const PLAYED = CORE_DOCS.filter((d) => !d.doc.tags.includes(HANDOUT_TAG));
  const weight = (d: (typeof PLAYED)[number]) => RARITY_WEIGHT[d.doc.rarity];
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const pool = (character: "bonus" | "penalty") => PLAYED.filter((d) => d.doc.character === character);
  const poolWeight = (character: "bonus" | "penalty") => sum(pool(character).map(weight));
  /** How often a roll lands on a cell of the pool's wheel and the wheel hands one of these out. */
  const perRoll = (character: "bonus" | "penalty", of: typeof PLAYED) => CELL_SHARE[character] * (sum(of.map(weight)) / poolWeight(character));
  const near = (actual: number, expected: number, tolerance: number) => ({ actual, expected, near: Math.abs(actual - expected) <= tolerance });
  const actions = (doc: EntryDoc, when: string) =>
    doc.rules.filter((r) => r.when === when).flatMap((r) => r.do).filter((a) => isActionOp(a.op)).map((a) => ACTIONS[a.op as keyof typeof ACTIONS].schema.parse(a) as ActionDoc);
  const env = (doc: EntryDoc) => ({ params: {}, decls: doc.params ?? {}, resolve: () => null });
  /** Swaps and steals move both sides: the power counts the lead, the victim loses half of it; a swap turned back is the same swap. */
  const BOTH_SIDES = new Set(["swapPositions", "swapItems", "stealItem"]);
  const SYMMETRIC = new Set(["swapPositions", "swapItems"]);

  it("a harmful action: the pack's harmful items at their drops — what it takes, what turning it back takes, how often one comes", () => {
    const harmful = pool("bonus").filter(
      (d) => d.doc.kind === "item" && actions(d.doc, "onUse").some((a) => actionDef(a).harm(a, env(d.doc)) === "target"),
    );
    expect(harmful.length).toBeGreaterThan(0);
    const total = sum(harmful.map(weight));
    const takes = (d: (typeof PLAYED)[number]) => (actions(d.doc, "onUse").some((a) => BOTH_SIDES.has(a.op)) ? 0.5 : 1) * POWER.get(d.entryId)!;
    const turned = (d: (typeof PLAYED)[number]) => (actions(d.doc, "onUse").some((a) => SYMMETRIC.has(a.op)) ? 0 : takes(d));
    const { harm } = PLAY_MODEL.arrival;
    expect(near(harm.worth, sum(harmful.map((d) => weight(d) * takes(d))) / total, 0.1 + 0.1 * harm.worth)).toMatchObject({ near: true });
    expect(near(harm.turned, sum(harmful.map((d) => weight(d) * turned(d))) / total, 0.1 + 0.1 * harm.turned)).toMatchObject({ near: true });
    expect(near(harm.perRoll, perRoll("bonus", harmful), 0.003)).toMatchObject({ near: true });
  });

  it("an entry: each kind and character of the wheels — what one is worth, how often one lands", () => {
    for (const character of ["bonus", "penalty"] as const) {
      for (const kind of ["item", "effect"] as const) {
        const of = pool(character).filter((d) => d.doc.kind === kind);
        const model = PLAY_MODEL.arrival.entry[character][kind];
        const worth = sum(of.map((d) => weight(d) * POWER.get(d.entryId)!)) / sum(of.map(weight));
        expect({ character, kind, ...near(model.worth, worth, 0.1 + 0.1 * worth) }).toMatchObject({ near: true });
        expect({ character, kind, ...near(model.perRoll, perRoll(character, of), 0.003) }).toMatchObject({ near: true });
      }
    }
  });

  it("a protection: the share of the bonus items held that block or turn back a harmful action", () => {
    const bonusItems = pool("bonus").filter((d) => d.doc.kind === "item");
    const protections = bonusItems.filter((d) => actions(d.doc, "onIncoming").some((a) => a.op === "block" || a.op === "reflect"));
    expect(protections.map((d) => d.doc.slug).sort()).toEqual(["mirror_shield", "shield"]);
    const share = PLAY_MODEL.heldItems * (sum(protections.map(weight)) / sum(bonusItems.map(weight)));
    expect(near(PLAY_MODEL.shielded, share, 0.01)).toMatchObject({ near: true });
  });

  it("a move back: the penalty drops and the rivals' items that move a player back, at how often each comes", () => {
    const sign = (a: ActionDoc, doc: EntryDoc) => actionDef(a).sign?.(a, env(doc), ANY_PLAY) ?? 1;
    let rate = 0;
    let cells = 0;
    for (const d of PLAYED) {
      const power = POWER.get(d.entryId)!;
      let back: number | null = null;
      if (d.doc.kind === "effect") {
        for (const a of actions(d.doc, "onApply")) {
          if (a.op === "move" && (a.who ?? "self") === "self" && sign(a, d.doc) < 0) back = power;
          if (a.op === "swapPositions" && a.with === "nearestBehind") back = power / 2;
        }
      } else if (d.doc.character === "bonus") {
        for (const a of actions(d.doc, "onUse")) {
          if ((a.op === "move" || a.op === "rollbackLastMove") && a.who === "target") back = power;
          if (a.op === "swapPositions" && a.with === "target") back = power / 2;
        }
      }
      if (back === null) continue;
      const r = CELL_SHARE[d.doc.character] * (weight(d) / poolWeight(d.doc.character));
      rate += r;
      cells += r * back;
    }
    const { moveBack } = PLAY_MODEL.arrival;
    expect(near(moveBack.worth, cells / rate, 0.1 + 0.1 * moveBack.worth)).toMatchObject({ near: true });
    expect(near(moveBack.perRoll, rate, 0.003)).toMatchObject({ near: true });
  });

  it("a completion condition: the pack's entries that add one, at how often each lands (wave C, spec §6.17)", () => {
    let rate = 0;
    const adding: string[] = [];
    for (const d of PLAYED) {
      const n = actions(d.doc, "onRollCreated").filter((a) => a.op === "addCondition").length;
      if (n === 0) continue;
      adding.push(d.doc.slug);
      rate += n * CELL_SHARE[d.doc.character] * (weight(d) / poolWeight(d.doc.character));
    }
    expect(adding.sort()).toEqual(["clean_start", "greedy_explorer", "hard_mode", "main_story", "no_dlc", "no_guides"]);
    expect(near(PLAY_MODEL.arrival.condition.perRoll, rate, 0.003)).toMatchObject({ near: true });
  });
});

describe("power — every core entry, against what it does in play", () => {
  // Measured once, on more seeds: the direction check below needs the margin.
  const CORE_SEEDS = 1000;
  /**
   * Where the play model puts the players an entry moves across (spec §14):
   * a player aimed at stands `aimGap` (6) ahead — with a last roll of 5 for
   * «Магнит» to compare against — the nearest rival behind `behindGap` (4)
   * back, and a last move undone was a pass of 4.
   */
  const PLACING: Readonly<Record<string, Placing>> = {
    portal_scroll: { rivalAhead: 6 },
    swap_scroll: { rivalAhead: 6 },
    teleport_ring: { rivalAhead: 6 },
    magnet: { rivalAhead: 6, lastRoll: { rival: 5 } },
    time_stone: { lastMove: { rival: 4 } },
    pursuit: { rivalAhead: -4 },
    castling: { rivalAhead: -4 },
  };
  /**
   * What the holder carries first: a cleanse is worth what it takes away, so
   * the salve and the amulet are measured on a poisoned holder; «Бремя» on a
   * holder with an item, as the play model's one held item on average.
   */
  const CARRIES: Readonly<Record<string, readonly string[]>> = {
    cleansing_salve: [CORE_ENTRY_IDS.poison],
    purifying_amulet: [CORE_ENTRY_IDS.poison],
    burden: [CORE_ENTRY_IDS.speed_boots],
  };
  // A handout plays only when its item hands it out (spec §6.6): it is measured
  // inside that item, and its power is part of the item's.
  const PLAYED = CORE_DOCS.filter((d) => !d.doc.tags.includes(HANDOUT_TAG));
  /**
   * Entries whose worth lies in what players hold and aim at each other (wave
   * B, spec §6.12–§6.14): items changing hands or picked from the catalog,
   * protections and what keeps a player out of reach or from their items,
   * limits on what they hold, a bonus wheel spun again. The simulator's rivals
   * use nothing a run hands out, and nothing it hands out is used, so play
   * cannot show what these are worth: their actions are held to the pack
   * above, and here they are measured for their direction only.
   */
  const HELD_TO_THE_PACK = new Set([
    "chain",
    "copy_scroll",
    "curse",
    "curse_of_greed",
    "invisibility",
    "joker",
    "mark",
    "mirror_shield",
    "philosophers_stone",
    "phoenix",
    "pickpocket",
    "shield",
    "thief_glove",
    "trade_scroll",
    "treasure_map",
  ]);
  /**
   * Entries whose worth is the next game's (wave C, spec §6.16–§6.17): which
   * games the draw may hand out, a choice among several, a game in flight
   * replaced or set aside, completion conditions and immunity to them. The
   * simulator plays no game pool and no game is harder than another there, so
   * these do nothing in play: their worth is the play model's assumption, held
   * below, and they are measured not even for their direction. So are the
   * objects on the board (wave D, spec §6.18): the simulator places none — an
   * object is worth what it does to the one it meets, at the model's aim.
   */
  const HELD_TO_THE_MODEL = new Set([
    "clean_start",
    "era_pick",
    "favourite",
    "game_reroll",
    "genre_pick",
    "genre_trial",
    "genre_veto",
    "greedy_explorer",
    "hard_mode",
    "immunity",
    "main_story",
    "mine",
    "no_dlc",
    "no_guides",
    "old_hardware",
    "postponed_game",
    "second_chance",
    "snare",
    "spring",
    "three_doors",
    "uncharted_territory",
  ]);
  const IN_PLAY = PLAYED.filter((d) => !HELD_TO_THE_MODEL.has(d.doc.slug));
  const MEASURED = IN_PLAY.filter((d) => !HELD_TO_THE_PACK.has(d.doc.slug));
  const measured = new Map<string, Promise<Measured>>();
  const coreMeasure = (entryId: string, doc: EntryDoc) => {
    if (!measured.has(entryId)) {
      const placing = PLACING[doc.slug];
      measured.set(
        entryId,
        measureEntry(
          { entryId, doc, docOf: (id) => CORE.get(id) ?? null, wheels: WHEELS, carries: CARRIES[doc.slug] ?? [], ...(placing ? { placing } : {}) },
          { seeds: CORE_SEEDS, turns: turnsFor(doc) },
        ).then((m) => m!),
      );
    }
    return measured.get(entryId)!;
  };

  it("measures every core entry but the handouts", () => {
    expect(CORE_DOCS.filter((d) => !PLAYED.includes(d)).map((d) => d.doc.slug)).toEqual([
      "behind_doors",
      "chosen_era",
      "chosen_genre",
      "fate_roll",
      "favoured_game",
      "magnet_pull",
      "pick_of_two",
      "treasure_hunt",
      "vetoed_genre",
    ]);
  });

  it("holds to the pack only entries of the primitives the simulator cannot play", () => {
    const PACK_VALUED = new Set(["stealItem", "transferItem", "swapItems", "copyItem", "grantChosen", "block", "reflect", "replace", "untargetable", "forbidItems", "pierce", "holdLimit"]);
    // A handout's rules are its item's («Карта сокровищ» spins through «Поиск сокровищ»).
    const handedOut = (a: { op: string; entry?: { entry?: string } }) => {
      const doc = a.op === "grantEffect" || a.op === "grantItem" ? CORE.get(a.entry?.entry ?? "") : undefined;
      return doc && doc.tags.includes(HANDOUT_TAG) ? doc : null;
    };
    const valued = (doc: EntryDoc): boolean =>
      doc.rules.some((r) =>
        r.do.some((a) => {
          const handout = handedOut(a as { op: string; entry?: { entry?: string } });
          return PACK_VALUED.has(a.op) || (a.op === "extraSpin" && (a as { pool?: string }).pool === "bonus") || (handout !== null && valued(handout));
        }),
      );
    expect(PLAYED.filter((d) => valued(d.doc)).map((d) => d.doc.slug).sort()).toEqual([...HELD_TO_THE_PACK].sort());
  });

  it("holds to the model only entries of the next game's primitives and of the board's objects, and those wholly", () => {
    const MODEL_VALUED = new Set([
      "poolExclude",
      "poolRequire",
      "poolFavor",
      "chooseOfN",
      "rerollGame",
      "postponeGame",
      "addCondition",
      "conditionImmunity",
      "placeObject",
      "stopMove",
      "push",
      "extend",
      "spinInstead",
    ]);
    const ops = (doc: EntryDoc): string[] =>
      doc.rules.flatMap((r) =>
        r.do.flatMap((a) => {
          const handout = a.op === "grantEffect" ? CORE.get((a as unknown as { entry: { entry: string } }).entry.entry) : undefined;
          return handout?.tags.includes(HANDOUT_TAG) ? ops(handout) : [a.op];
        }),
      );
    const of = PLAYED.filter((d) => ops(d.doc).some((op) => MODEL_VALUED.has(op)));
    expect(of.map((d) => d.doc.slug).sort()).toEqual([...HELD_TO_THE_MODEL].sort());
    // Nothing else in them for the simulator to play.
    for (const d of of) expect({ slug: d.doc.slug, ops: ops(d.doc).filter((op) => !MODEL_VALUED.has(op)) }).toEqual({ slug: d.doc.slug, ops: [] });
  });

  it.each(MEASURED.map((d) => [d.doc.slug, d] as const))("%s", async (_slug, { entryId, doc }) => {
    const m = await coreMeasure(entryId, doc);
    const power = POWER.get(entryId)!;
    expect({ power, measured: Math.round(m.value * 10) / 10, agrees: agrees(power, m) }).toMatchObject({ agrees: true });
  });

  // Measured one by one, so that the direction check below reads them all done.
  it.each(IN_PLAY.filter((d) => HELD_TO_THE_PACK.has(d.doc.slug)).map((d) => [d.doc.slug, d] as const))(
    "%s — held to the pack, measured for its direction",
    async (_slug, { entryId, doc }) => {
      const { value, error } = await coreMeasure(entryId, doc);
      const against = doc.character === "bonus" ? value < -2 * error : value > 2 * error;
      expect({ slug: doc.slug, against }).toEqual({ slug: doc.slug, against: false });
    },
  );

  it("every core entry sits at or below its rarity", () => {
    for (const { entryId, doc } of CORE_DOCS) {
      expect({ slug: doc.slug, above: aboveRarity(POWER.get(entryId)!, doc.rarity) }).toEqual({ slug: doc.slug, above: false });
    }
  });

  it("no core entry works against its character in play", async () => {
    // Dice act on drops too, where more and bigger dice move a player further
    // back: "Lucky" used to cost its holder ground and "Unlucky" to save it,
    // and so did the items that hand them out — until both were set to act on
    // passed games only (the owner's call, 2026-10-09).
    const against: string[] = [];
    for (const { entryId, doc } of IN_PLAY) {
      const { value, error } = await coreMeasure(entryId, doc);
      // A bonus entry should put its holder (or the user, for one aimed at
      // others) ahead; a penalty one should set its holder back.
      const wrong = doc.character === "bonus" ? value < -2 * error : value > 2 * error;
      if (wrong) against.push(doc.slug);
    }
    expect(against).toEqual([]);
  });
});

/**
 * The next game (wave C, spec §6.16): a game is worth how likely its player is
 * to pass it, and the pool's primitives move that chance by an assumption —
 * the simulator plays no game pool, so nothing here can be measured in play.
 * Their calibration case is the assumption itself, held to the model: a pass
 * instead of a drop, times the chance each moves.
 */
describe("power — the next game's primitives, held to the play model's assumptions (not measured)", () => {
  const cost = (a: ActionDoc) => (actionDef(a).sign?.(a, { params: {}, decls: {}, resolve: () => null }, ANY_PLAY) ?? 1) * actionDef(a).cost(a, { params: {}, decls: {}, resolve: () => null }, ANY_PLAY);
  const { gameSwing, pool } = PLAY_MODEL;

  it("a pass instead of a drop is the dice's pass forward and the streak-weighted drop back", () => {
    expect(gameSwing).toBeCloseTo(PLAY_MODEL.passDice * PLAY_MODEL.dieMean + PLAY_MODEL.dropDice * PLAY_MODEL.dieMean * (PLAY_MODEL.dropWeight / (1 - PLAY_MODEL.passRate)), 9);
  });

  it.each([
    [{ op: "poolRequire", genres: "picked" }, pool.picked.require.genre],
    [{ op: "poolRequire", years: "picked" }, pool.picked.require.years],
    [{ op: "poolExclude", genres: "picked" }, pool.picked.exclude.genre],
    [{ op: "poolExclude", genres: "lastPassed" }, pool.imposed.genres],
    [{ op: "poolRequire", years: { max: 2009 } }, pool.imposed.years],
    [{ op: "poolExclude", rating: { max: 2 } }, pool.imposed.rating],
    [{ op: "poolFavor", factor: 3 }, 2 * pool.favor],
    [{ op: "chooseOfN", n: 2 }, pool.choice[2]],
    [{ op: "chooseOfN", n: 3 }, pool.choice[3]],
    [{ op: "rerollGame" }, pool.reroll],
    [{ op: "postponeGame", afterRolls: 2 }, pool.postpone],
    [{ op: "addCondition", text: { ru: "Без гайдов" } }, pool.condition],
  ] as [ActionDoc, number][])("%o moves the chance by its assumption", (action, shift) => {
    expect(isActionOp(action.op)).toBe(true);
    expect(cost(action)).toBeCloseTo(shift * gameSwing, 9);
  });

  it("immunity is worth the conditions a game gets in a roll, at what each takes; one that waits, a condition a firing (spec §6.17)", () => {
    expect(cost({ op: "conditionImmunity" })).toBeCloseTo(PLAY_MODEL.arrival.condition.perRoll * -pool.condition * gameSwing, 9);
    const waiting = actionDef({ op: "conditionImmunity" }).cost({ op: "conditionImmunity" }, { params: {}, decls: {}, resolve: () => null }, { ...ANY_PLAY, waits: true });
    expect(waiting).toBeCloseTo(-pool.condition * gameSwing, 9);
  });
});
