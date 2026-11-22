import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc, ScenarioDoc, ScenarioStep } from "@/lib/engine/iee/dsl";

import { runEntryScenarios, scenarioIssues, scenarioSeasonConfig, type ScenarioRun } from "./scenarios";

const DOCS = new Map(CORE_DOCS.map((r) => [r.entryId, r.doc]));
const ref = (key: CoreKey) => ({ entry: CORE_ENTRY_IDS[key], slug: key });
const docOf = (id: string) => DOCS.get(id) ?? null;

/** Runs `scenarios` as if they were written on the core entry `key`. */
function run(key: CoreKey, scenarios: ScenarioDoc[], over: Partial<EntryDoc> = {}): Promise<ScenarioRun> {
  const entryId = CORE_ENTRY_IDS[key];
  return runEntryScenarios({ entryId, doc: { ...DOCS.get(entryId)!, ...over, scenarios }, docOf });
}

const title = { ru: "Сценарий", en: "Scenario" };
const scenario = (steps: ScenarioStep[], given: ScenarioDoc["given"] = undefined): ScenarioDoc =>
  given ? { title, given, steps } : { title, steps };
const roll = (expect: Extract<ScenarioStep, { do: "roll" }>["expect"], over: Partial<Extract<ScenarioStep, { do: "roll" }>> = {}) =>
  ({ do: "roll", outcome: "passed", dice: 5, expect, ...over }) as const;

/** What each step observed, for compact assertions. */
const seen = (r: ScenarioRun, field: string) => r.reports[0]!.steps.map((s) => (s.observed as unknown as Record<string, unknown>)?.[field]);

describe("entry scenarios — effects over whole turns", () => {
  it("«Болото» shortens two moves and is gone after them (SC-SWAMP-2, as data)", async () => {
    const r = await run("swamp", [
      scenario([roll({ moved: 4 }), roll({ moved: 4 }), roll({ moved: 5, holder: [{ entry: "self", count: 0 }] })], {
        holder: { carries: [{ entry: "self" }] },
      }),
    ]);
    expect(r.ok).toBe(true);
    expect(seen(r, "moved")).toEqual([4, 4, 5]);
  });

  it("a second copy refreshes: one instance, one cell (SC-SWAMP-3)", async () => {
    const r = await run("swamp", [
      scenario(
        [
          { do: "grant", entry: "self", expect: { result: "refreshed", holder: [{ entry: "self", count: 1 }] } },
          roll({ moved: 4 }),
        ],
        { holder: { carries: [{ entry: "self" }] } },
      ),
    ]);
    expect(r.ok).toBe(true);
  });

  it("a dropped game moves back by both dice, and a penalty lengthens it", async () => {
    const r = await run("swamp", [
      scenario([roll({ moved: -7, diceCount: 2 }, { outcome: "dropped", dice: 6 })], { holder: { carries: [{ entry: "self" }] } }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("«Отравление» counts passed games only (SC-POISON-3)", async () => {
    const steps = [
      roll({ moved: -5 }, { outcome: "dropped", dice: 4 }),
      roll({ moved: -5 }, { outcome: "dropped", dice: 4 }),
      roll({ moved: 4 }),
      roll({ moved: 4, holder: [{ entry: "self", count: 0 }] }),
      roll({ moved: 5 }),
    ];
    const r = await run("poison", [scenario(steps, { holder: { position: 20, carries: [{ entry: "self" }] } })]);
    expect(r.ok).toBe(true);
  });

  it("dice: «Везение» adds two sides, «Невезение» cancels it, the season's sides count (SC-LUCKY-1, SC-UNLUCKY-2, -4)", async () => {
    expect((await run("lucky", [scenario([roll({ diceSides: 8 })], { holder: { carries: [{ entry: "self" }] } })])).ok).toBe(true);
    const both = scenario([roll({ diceSides: 6 })], { holder: { carries: [{ entry: "self" }, { entry: ref("lucky") }] } });
    expect((await run("unlucky", [both])).ok).toBe(true);
    const d3 = scenario([roll({ diceSides: 2 }, { dice: 2 })], { sides: 3, holder: { carries: [{ entry: "self" }] } });
    expect((await run("unlucky", [d3])).ok).toBe(true);
  });

  it("«Невезение» is unique: a second copy is refused (SC-UNLUCKY-3)", async () => {
    const r = await run("unlucky", [
      scenario([{ do: "grant", entry: "self", expect: { result: "refused" } }, roll({ diceSides: 4 }, { dice: 3 })], {
        holder: { carries: [{ entry: "self" }] },
      }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("«Пошлина» costs a point per landing and never goes below zero (SC-TOLL-1, -2)", async () => {
    const r = await run("toll", [scenario([roll({ balance: -1 })], { holder: { carries: [{ entry: "self" }] } })]);
    expect(r.ok).toBe(true);
    const broke = await run("toll", [scenario([roll({ balance: 0 })], { holder: { balance: 0, carries: [{ entry: "self" }] } })]);
    expect(broke.ok).toBe(true);
  });

  it("«Импульс» pays on a pass and not on a drop (SC-MOMENTUM-1, -2)", async () => {
    const r = await run("momentum", [
      scenario([roll({ balance: 1 }), roll({ balance: 0 }, { outcome: "dropped", dice: 4 })], {
        holder: { carries: [{ entry: "self" }] },
      }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("«Оберег» absorbs a penalty landing — no cell, no wheel — and is spent (SC-WARD-1, -2)", async () => {
    const r = await run("ward", [
      scenario(
        [
          roll({ cellFires: true, wheel: "bonus", holder: [{ entry: "self", count: 1 }] }, { cell: "bonus" }),
          roll({ cellFires: false, wheel: "none", holder: [{ entry: "self", count: 0 }] }, { cell: "penalty" }),
          roll({ cellFires: true, wheel: "penalty" }, { cell: "penalty" }),
        ],
        { holder: { carries: [{ entry: "self" }] } },
      ),
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("entry scenarios — items, with the item path's guards", () => {
  it("«Свиток порчи» puts «Болото» on the rival and is spent (SC-HEXSCROLL-1)", async () => {
    const r = await run("hex_scroll", [
      scenario(
        [
          {
            do: "use",
            on: "rival",
            expect: { result: "used", rival: [{ entry: ref("swamp"), count: 1 }], holder: [{ entry: "self", count: 0 }] },
          },
          roll({ moved: 4 }, { by: "rival" }),
        ],
        { holder: { carries: [{ entry: "self" }] } },
      ),
    ]);
    expect(r.ok).toBe(true);
  });

  it("refuses no target, the holder, and a rival who left (SC-HEXSCROLL-2, -3, -4)", async () => {
    const given = { holder: { carries: [{ entry: "self" as const }] } };
    const refused = (reason: string) => ({ result: "refused" as const, reason: reason as never, holder: [{ entry: "self" as const, count: 1 }] });
    expect((await run("hex_scroll", [scenario([{ do: "use", on: "nobody", expect: refused("ieeTargetRequired") }], given)])).ok).toBe(true);
    expect((await run("hex_scroll", [scenario([{ do: "use", on: "holder", expect: refused("ieeTargetSelfNotAllowed") }], given)])).ok).toBe(true);
    const left = { ...given, rival: { left: true } };
    expect((await run("hex_scroll", [scenario([{ do: "use", expect: refused("ieeTargetNotActive") }], left)])).ok).toBe(true);
  });

  it("cannot reach a move already in flight (SC-HEXSCROLL-7)", async () => {
    const r = await run("hex_scroll", [
      scenario(
        [{ do: "use", expect: { result: "used" } }, roll({ moved: 5 }, { by: "rival" }), roll({ moved: 4 }, { by: "rival" })],
        { holder: { carries: [{ entry: "self" }] }, rival: { inFlight: true } },
      ),
    ]);
    expect(r.ok).toBe(true);
  });

  it("a before-roll item is refused with a game in flight, and its charge is kept (SC-SPEEDBOOTS-2)", async () => {
    const r = await run("speed_boots", [
      scenario([{ do: "use", expect: { result: "refused", reason: "ieeItemWrongWindow", holder: [{ entry: "self", count: 1 }] } }], {
        holder: { inFlight: true, carries: [{ entry: "self" }] },
      }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("an item used up is «already used», one never held is «not found»", async () => {
    const r = await run("speed_boots", [
      scenario(
        [
          { do: "use", expect: { result: "used", holder: [{ entry: ref("tailwind"), count: 1 }] } },
          { do: "use", expect: { result: "refused", reason: "ieeItemAlreadyUsed" } },
          roll({ moved: 7 }),
        ],
        { holder: { carries: [{ entry: "self" }] } },
      ),
    ]);
    expect(r.ok).toBe(true);
    expect((await run("speed_boots", [scenario([{ do: "use", expect: { reason: "ieeItemNotFound" } }])])).ok).toBe(true);
  });

  it("an effect's scenario may use another item: the salve clears it (SC-BOOTS-4, as data)", async () => {
    const r = await run("swamp", [
      scenario(
        [
          {
            do: "use",
            item: ref("cleansing_salve"),
            expect: { result: "used", holder: [{ entry: "self", count: 0 }, { entry: ref("ward"), count: 1 }] },
          },
          roll({ moved: 5 }),
        ],
        { holder: { carries: [{ entry: "self" }, { entry: ref("ward") }, { entry: ref("cleansing_salve") }] } },
      ),
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("entry scenarios — out-of-turn moves (spec §7.3)", () => {
  const OWN = "77777777-7777-4777-8777-777777777777";
  const own = (doc: Omit<EntryDoc, "dslVersion" | "slug" | "name" | "rarity" | "tags">, scenarios: ScenarioDoc[]) =>
    runEntryScenarios({
      entryId: OWN,
      doc: { dslVersion: 1, slug: "shove", name: { ru: "Толчок", en: "Shove" }, rarity: "common", tags: ["movement"], ...doc, scenarios },
      docOf,
    });

  it("a step sees where each player stands after an instant effect moves the holder", async () => {
    const r = await own(
      { kind: "effect", character: "penalty", duration: { unit: "instant" }, rules: [{ when: "onApply", do: [{ op: "move", by: -3 }] }] },
      [scenario([{ do: "grant", entry: "self", expect: { result: "granted", position: 7, rivalPosition: 12, holder: [{ entry: "self", count: 0 }] } }])],
    );
    expect(r.ok).toBe(true);
    expect(seen(r, "position")).toEqual([7]);
    expect(seen(r, "rivalPosition")).toEqual([12]);
  });

  it("an item swaps places with the chosen player; a missed cell is red and says which", async () => {
    const swap = {
      kind: "item" as const,
      character: "bonus" as const,
      usage: { activation: "active" as const, charges: 1, target: { who: "other" as const } },
      rules: [{ when: "onUse" as const, do: [{ op: "swapPositions" as const, with: "target" as const }] }],
    };
    const carried = { holder: { carries: [{ entry: "self" as const }] } };
    expect((await own(swap, [scenario([{ do: "use", expect: { result: "used", position: 12, rivalPosition: 10 } }], carried)])).ok).toBe(true);
    const red = await own(swap, [scenario([{ do: "use", expect: { position: 10 } }], carried)]);
    expect(red.ok).toBe(false);
    expect(scenarioIssues(red)).toMatchObject([
      { code: "scenario_failed", path: ["scenarios", 0, "steps", 0, "expect", "position"], params: { expected: "10", actual: "12" } },
    ]);
  });

  it("a regular move shows in the position too", async () => {
    const r = await run("swamp", [scenario([roll({ moved: 4, position: 14, rivalPosition: 12 })], { holder: { carries: [{ entry: "self" }] } })]);
    expect(r.ok).toBe(true);
  });
});

describe("entry scenarios — cursed items and picks (spec §6.10)", () => {
  const OWN = "77777777-7777-4777-8777-777777777778";
  const run = (doc: Omit<EntryDoc, "dslVersion" | "slug" | "name" | "rarity" | "tags">, scenarios: ScenarioDoc[]) =>
    runEntryScenarios({
      entryId: OWN,
      doc: { dslVersion: 1, slug: "own", name: { ru: "Своё", en: "Own" }, rarity: "common", tags: [], ...doc, scenarios },
      docOf,
    });

  it("a cursed item carried bites the next pass and is gone", async () => {
    const r = await run(
      {
        kind: "item",
        character: "penalty",
        usage: { activation: "cursed", charges: 1 },
        rules: [{ when: "afterDice", do: [{ op: "resultModify", delta: -2 }] }],
      },
      [scenario([roll({ moved: 3, holder: [{ entry: "self", count: 0 }] }), roll({ moved: 5 })], { holder: { carries: [{ entry: "self" }] } })],
    );
    expect(r.ok).toBe(true);
  });

  it("a use picks what it removes: the holder's newest of the entry the step names", async () => {
    const amulet = {
      kind: "item" as const,
      character: "bonus" as const,
      usage: { activation: "active" as const, charges: 1, target: { who: "self" as const } },
      rules: [{ when: "onUse" as const, do: [{ op: "remove" as const, what: "any" as const, character: "penalty" as const, pick: "choice" as const }] }],
    };
    const carries = { holder: { carries: [{ entry: "self" as const }, { entry: ref("swamp") }, { entry: ref("poison") }] } };
    const picked = await run(amulet, [
      scenario(
        [{ do: "use", choose: ref("poison"), expect: { result: "used", holder: [{ entry: ref("poison"), count: 0 }, { entry: ref("swamp"), count: 1 }] } }],
        carries,
      ),
    ]);
    expect(picked.ok).toBe(true);
    // No pick: refused, and the charge kept.
    const none = await run(amulet, [scenario([{ do: "use", expect: { result: "refused", reason: "ieeChoiceRequired", holder: [{ entry: "self", count: 1 }] } }], carries)]);
    expect(none.ok).toBe(true);
    // A bonus is not a penalty: not a pick this item may take.
    const wrong = await run(amulet, [
      scenario([{ do: "use", choose: ref("ward"), expect: { result: "refused", reason: "ieeChoiceInvalid" } }], {
        holder: { carries: [{ entry: "self" }, { entry: ref("ward") }] },
      }),
    ]);
    expect(wrong.ok).toBe(true);
  });
});

describe("entry scenarios — what arrives: a rival's use, a drop (wave B, spec §6.13)", () => {
  const CURSE = "77777777-7777-4777-8777-777777777777";
  const curse: EntryDoc = {
    dslVersion: 1,
    kind: "effect",
    slug: "curse_test",
    name: { ru: "Проклятие" },
    character: "penalty",
    rarity: "rare",
    tags: [],
    duration: { unit: "next_game" },
    stacking: { mode: "refresh" },
    rules: [{ when: "onIncoming", if: [{ op: "incoming", is: "entry", kind: "item", character: "bonus" }], do: [{ op: "block" }] }],
  };

  it("the rival uses an item — on the holder unless the step says otherwise", async () => {
    const r = await run("swamp", [
      scenario(
        [{ do: "use", by: "rival", item: ref("hex_scroll"), expect: { result: "used", holder: [{ entry: "self", count: 1 }], rival: [{ entry: ref("hex_scroll"), count: 0 }] } }],
        { rival: { carries: [{ entry: ref("hex_scroll") }] } },
      ),
      scenario([{ do: "use", by: "rival", item: ref("hex_scroll"), expect: { result: "refused", reason: "ieeItemNotFound" } }]),
    ]);
    expect(r.reports.map((x) => x.ok)).toEqual([true, true]);
  });

  it("a drop may be answered by the recipient's entries; what staff hand out is not", async () => {
    const r = await runEntryScenarios({
      entryId: CURSE,
      doc: {
        ...curse,
        scenarios: [
          scenario(
            [
              { do: "grant", entry: ref("speed_boots"), via: "wheel", expect: { result: "refused", holder: [{ entry: ref("speed_boots"), count: 0 }] } },
              { do: "grant", entry: ref("speed_boots"), expect: { result: "granted", holder: [{ entry: ref("speed_boots"), count: 1 }] } },
            ],
            { holder: { carries: [{ entry: "self" }] } },
          ),
        ],
      },
      docOf,
    });
    expect(r.ok).toBe(true);
  });
});

describe("entry scenarios — the player's choices (wave B, spec §7.6)", () => {
  const TAX = "88888888-8888-4888-8888-888888888888";
  const tax = (scenarios: ScenarioDoc[]): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug: "tax_test",
    name: { ru: "Налог" },
    character: "penalty",
    rarity: "common",
    tags: [],
    duration: { unit: "instant" },
    rules: [
      { when: "onApply", if: [{ op: "itemCount", cmp: "gte", value: 1, character: "bonus" }], do: [{ op: "victimChoice" }] },
      { when: "onApply", if: [{ op: "itemCount", cmp: "eq", value: 0, character: "bonus" }], do: [{ op: "move", by: -1 }] },
    ],
    scenarios,
  });
  const carrying = { holder: { carries: [{ entry: ref("speed_boots") }, { entry: ref("cleansing_salve") }] } };
  const play = (scenarios: ScenarioDoc[]) => runEntryScenarios({ entryId: TAX, doc: tax(scenarios), docOf });

  it("a choice waits after the grant; the holder answers it, and items wait until they do", async () => {
    const r = await play([
      scenario(
        [
          { do: "grant", entry: "self", expect: { decision: "pending", holder: [{ entry: ref("speed_boots"), count: 1 }, { entry: ref("cleansing_salve"), count: 1 }] } },
          { do: "use", item: ref("speed_boots"), expect: { result: "refused", reason: "ieeDecisionPending" } },
          { do: "decide", option: "discard", picks: [ref("cleansing_salve")], expect: { result: "decided", decision: "none", holder: [{ entry: ref("cleansing_salve"), count: 0 }] } },
          { do: "decide", expect: { result: "refused" } },
        ],
        carrying,
      ),
    ]);
    expect(r.reports[0]!.steps.map((s) => s.checks.filter((c) => !c.ok))).toEqual([[], [], [], []]);
    expect(r.ok).toBe(true);
  });

  it("starting the next game takes the default — the commonest goes — and an answer that does not fit is refused", async () => {
    const r = await play([
      scenario(
        [
          { do: "grant", entry: "self" },
          { do: "decide", option: "retain", picks: [ref("cleansing_salve")], expect: { result: "refused", decision: "pending" } },
          { do: "roll", outcome: "passed", dice: 4, expect: { decision: "none", holder: [{ entry: ref("speed_boots"), count: 0 }, { entry: ref("cleansing_salve"), count: 1 }] } },
        ],
        carrying,
      ),
      // With nothing to give, the other rule moves the holder a cell back — no question.
      scenario([{ do: "grant", entry: "self", expect: { decision: "none", position: 9 } }]),
      // The default named outright.
      scenario([{ do: "grant", entry: "self" }, { do: "decide", expect: { result: "decided", holder: [{ entry: ref("speed_boots"), count: 0 }] } }], carrying),
    ]);
    expect(r.reports.map((x) => x.ok)).toEqual([true, true, true]);
  });
});

describe("entry scenarios — the reaction window (wave B, spec §7.4)", () => {
  const COIN = "77777777-7777-4777-8777-777777777777";
  const coin = (scenarios: ScenarioDoc[]): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug: "coin_test",
    name: { ru: "Монета" },
    character: "bonus",
    rarity: "common",
    tags: [],
    usage: { activation: "active", charges: 1, window: "after_dice" },
    rules: [{ when: "onUse", do: [{ op: "reroll" }] }],
    scenarios,
  });
  const play = (scenarios: ScenarioDoc[]) => runEntryScenarios({ entryId: COIN, doc: coin(scenarios), docOf });
  const carrying = { holder: { carries: [{ entry: "self" as const }] } };

  it("the roller answers the window as the step says: the item used throws again from `then`, and is spent", async () => {
    const r = await play([
      scenario([roll({ moved: 6, window: "used", holder: [{ entry: "self", count: 0 }] }, { dice: 2, then: [6], react: "self" })], carrying),
      // Not named: the window opens and the dice are accepted; the coin stays.
      scenario([roll({ moved: 2, window: "accepted", holder: [{ entry: "self", count: 1 }] }, { dice: 2 })], carrying),
      // Nobody holds one: no window.
      scenario([roll({ moved: 2, window: "none" }, { dice: 2 })]),
    ]);
    expect(r.reports.map((x) => x.steps.map((st) => st.checks.filter((c) => !c.ok)))).toEqual([[[]], [[]], [[]]]);
    expect(r.ok).toBe(true);
  });

  it("an item cannot be used from the inventory: it waits for the window", async () => {
    const r = await play([scenario([{ do: "use", expect: { result: "refused", reason: "ieeItemReactionOnly" } }], carrying)]);
    expect(r.ok).toBe(true);
  });
});

describe("entry scenarios — red, broken, and the findings they make", () => {
  it("a missed expectation is red, and says where and what", async () => {
    const r = await run("swamp", [
      scenario([roll({ moved: 4 }), roll({ moved: 5, holder: [{ entry: "self", count: 1 }] })], {
        holder: { carries: [{ entry: "self" }] },
      }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.reports[0]!.steps.map((s) => s.ok)).toEqual([true, false]);
    expect(scenarioIssues(r)).toEqual([
      {
        code: "scenario_failed",
        path: ["scenarios", 0, "steps", 1, "expect", "moved"],
        message: "scenario 1 «Сценарий», step 2: expected moved 5, got 4",
        params: { scenario: "1", title: "Сценарий", step: "2", field: "moved", expected: "5", actual: "4" },
      },
      {
        code: "scenario_failed",
        path: ["scenarios", 0, "steps", 1, "expect", "holder"],
        message: "scenario 1 «Сценарий», step 2: expected holder swamp 1, got 0",
        params: { scenario: "1", title: "Сценарий", step: "2", field: "holder", expected: "1", actual: "0", entry: "swamp" },
      },
    ]);
  });

  it("dice that cannot show the number break the step, and nothing after it runs", async () => {
    const r = await run("swamp", [scenario([roll({}, { outcome: "dropped", dice: 1 }), roll({ moved: 5 })])]);
    expect(r.ok).toBe(false);
    expect(r.reports[0]!.steps).toHaveLength(1);
    expect(scenarioIssues(r)).toMatchObject([
      { code: "scenario_broken", path: ["scenarios", 0, "steps", 0], params: { reason: "dice_impossible", total: "1", count: "2", sides: "6" } },
    ]);
  });

  it("a rival who left the run cannot roll", async () => {
    const r = await run("swamp", [scenario([roll({}, { by: "rival" })], { rival: { left: true } })]);
    expect(scenarioIssues(r)).toMatchObject([{ code: "scenario_broken", params: { reason: "not_in_run", who: "rival" } }]);
  });

  it("an entry that does not compile with what it names is broken, not green", async () => {
    const r = await runEntryScenarios({
      entryId: CORE_ENTRY_IDS.speed_boots,
      doc: { ...DOCS.get(CORE_ENTRY_IDS.speed_boots)!, scenarios: [scenario([{ do: "use" }])] },
      docOf: () => null,
    });
    expect(r.ok).toBe(false);
    expect(scenarioIssues(r)).toMatchObject([{ code: "scenario_broken", params: { reason: "compile" } }]);
  });

  it("an entry the scenario names but nothing hands over is broken, not quietly skipped", async () => {
    const r = await runEntryScenarios({
      entryId: CORE_ENTRY_IDS.swamp,
      doc: { ...DOCS.get(CORE_ENTRY_IDS.swamp)!, scenarios: [scenario([roll({ moved: 5 })], { holder: { carries: [{ entry: ref("ward") }] } })] },
      docOf: () => null,
    });
    expect(scenarioIssues(r)).toMatchObject([
      { code: "scenario_broken", path: ["scenarios", 0, "steps", 0], params: { reason: "missing_entry", entry: CORE_ENTRY_IDS.ward } },
    ]);
  });

  it("draws: low makes every chance hold, high makes none", async () => {
    const lucky: Partial<EntryDoc> = {
      rules: [{ when: "afterMovement", if: [{ op: "chance", percent: 50 }], do: [{ op: "steps", delta: 2 }] }],
    };
    const low = await run("tailwind", [scenario([roll({ moved: 7 })], { holder: { carries: [{ entry: "self" }] } })], lucky);
    const high = await run("tailwind", [scenario([roll({ moved: 5 })], { draws: "high", holder: { carries: [{ entry: "self" }] } })], lucky);
    expect([low.ok, high.ok]).toEqual([true, true]);
  });

  it("no scenarios, nothing to run: green", async () => {
    expect(await run("swamp", [])).toEqual({ ok: true, reports: [] });
  });

  it("the scenario season is the documented one", () => {
    const config = scenarioSeasonConfig();
    expect(config.dice).toEqual({ sides: 6, passDiceCount: 1, dropDiceCount: 2, dropStreakMultiplier: false });
    expect(config.points.bonusAddsToRollOnPass).toBe(false);
    expect(config.board).toMatchObject({ size: 40, loop: false });
    expect(config.iee).toMatchObject({ enabled: true, allowTargetingOthers: true, pvpProtectionMoves: 0 });
    expect(scenarioSeasonConfig(3).dice.sides).toBe(3);
  });
});

describe("entry scenarios — the chosen player's last roll (wave A, spec §6.11)", () => {
  it("«Магнит»: the effect a use leaves its user compares their roll with the rival's last one", async () => {
    const pullId = CORE_ENTRY_IDS.tailwind;
    const pull: EntryDoc = {
      ...DOCS.get(pullId)!,
      rules: [{ when: "afterMovement", if: [{ op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" }], do: [{ op: "steps", delta: 2 }] }],
      scenarios: undefined,
    };
    const use = { do: "use" as const, expect: { result: "used" as const } };
    const magnet: EntryDoc = {
      ...DOCS.get(CORE_ENTRY_IDS.speed_boots)!,
      usage: { activation: "active", charges: 1, target: { who: "other" } },
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: ref("tailwind"), to: "self" }] }],
      scenarios: [
        // 3 is lower than their 5: two cells more.
        scenario([use, roll({ moved: 5 }, { dice: 3 })], { holder: { carries: [{ entry: "self" }] }, rival: { lastRoll: 5 } }),
        // Not lower than their 2: the move as thrown.
        scenario([use, roll({ moved: 3 }, { dice: 3 })], { holder: { carries: [{ entry: "self" }] }, rival: { lastRoll: 2 } }),
        // A rival who has not moved has no roll to compare with.
        scenario([use, roll({ moved: 3 }, { dice: 3 })], { holder: { carries: [{ entry: "self" }] } }),
      ],
    };
    const r = await runEntryScenarios({ entryId: CORE_ENTRY_IDS.speed_boots, doc: magnet, docOf: (id) => (id === pullId ? pull : docOf(id)) });
    expect(r.reports.map((report) => report.ok)).toEqual([true, true, true]);
  });
});

describe("entry scenarios — item operations (wave B, spec §6.12)", () => {
  const OWN = "77777777-7777-4777-8777-777777777779";
  const run = (doc: Omit<EntryDoc, "dslVersion" | "slug" | "name" | "rarity" | "tags">, scenarios: ScenarioDoc[]) =>
    runEntryScenarios({
      entryId: OWN,
      doc: { dslVersion: 1, slug: "own", name: { ru: "Своё", en: "Own" }, rarity: "rare", tags: [], ...doc, scenarios },
      docOf,
    });
  const self = { activation: "active" as const, charges: 1, target: { who: "self" as const } };

  it("a use picks an item of the catalog: the entry the step names, held to the item's filter", async () => {
    const joker = { kind: "item" as const, character: "bonus" as const, usage: self, rules: [{ when: "onUse" as const, do: [{ op: "grantChosen" as const, rarity: ["common" as const] }] }] };
    const carries = { holder: { carries: [{ entry: "self" as const }] } };
    const picked = await run(joker, [
      scenario([{ do: "use", chooseEntry: ref("speed_boots"), expect: { result: "used", holder: [{ entry: ref("speed_boots"), count: 1 }, { entry: "self", count: 0 }] } }], carries),
    ]);
    expect(picked.ok).toBe(true);
    const none = await run(joker, [scenario([{ do: "use", expect: { result: "refused", reason: "ieeEntryChoiceRequired" } }], carries)]);
    expect(none.ok).toBe(true);
    // «Очищающая мазь» is rare: not this item's to hand out.
    const rare = await run(joker, [scenario([{ do: "use", chooseEntry: ref("cleansing_salve"), expect: { result: "refused", reason: "ieeEntryChoiceInvalid" } }], carries)]);
    expect(rare.ok).toBe(true);
  });

  it("a steal takes the rival's item onto the holder's line", async () => {
    const glove = {
      kind: "item" as const,
      character: "bonus" as const,
      usage: { activation: "active" as const, charges: 1, target: { who: "other" as const } },
      rules: [{ when: "onUse" as const, do: [{ op: "stealItem" as const }] }],
    };
    const r = await run(glove, [
      scenario(
        [{ do: "use", expect: { result: "used", holder: [{ entry: ref("speed_boots"), count: 1 }], rival: [{ entry: ref("speed_boots"), count: 0 }] } }],
        { holder: { carries: [{ entry: "self" }] }, rival: { carries: [{ entry: ref("speed_boots") }] } },
      ),
    ]);
    expect(r.ok).toBe(true);
  });

  it("a roll says which wheel a rule spins once more", async () => {
    const map = {
      kind: "effect" as const,
      character: "bonus" as const,
      duration: { unit: "moves" as const, count: 1 },
      stacking: { mode: "refresh" as const },
      rules: [{ when: "afterCellEffect" as const, if: [{ op: "cellType" as const, in: ["bonus" as const] }], do: [{ op: "extraSpin" as const, pool: "bonus" as const }] }],
    };
    const carries = { holder: { carries: [{ entry: "self" as const }] } };
    const r = await run(map, [
      scenario([roll({ wheel: "bonus", wheelAgain: "bonus" }, { cell: "bonus" })], carries),
      scenario([roll({ wheel: "none", wheelAgain: "none" })], carries),
    ]);
    expect(r.reports.map((report) => report.ok)).toEqual([true, true]);
    expect(seen(r, "wheelAgain")).toEqual(["bonus"]);
  });
});

describe("entry scenarios — the next game (wave C, spec §5.5, §6.16, §7.12)", () => {
  const ID = (n: number) => `66666666-6666-4666-8666-6666666666${String(n).padStart(2, "0")}`;
  const effect = (slug: string, rules: EntryDoc["rules"], scenarios: ScenarioDoc[] = []): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug,
    name: { ru: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    duration: { unit: "next_game" },
    stacking: { mode: "refresh" },
    rules,
    ...(scenarios.length > 0 ? { scenarios } : {}),
  });
  const item = (slug: string, usage: NonNullable<EntryDoc["usage"]>, rules: EntryDoc["rules"], scenarios: ScenarioDoc[]): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug },
    character: "bonus",
    rarity: "rare",
    tags: [],
    usage,
    rules,
    scenarios,
  });
  const onOpenRoll = { activation: "active", window: "on_open_roll", charges: 1, target: { who: "self" } } as const;
  const VETO_EFFECT = effect("veto_effect", [{ when: "beforeGameRoll", do: [{ op: "poolRequire", genres: "picked" }] }]);
  const FAVOUR_EFFECT = effect("favour_effect", [{ when: "beforeGameRoll", do: [{ op: "poolFavor", factor: 3 }] }]);
  const DOORS = effect("three_doors_probe", [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 3 }] }]);
  const doorsRef = { entry: ID(3), slug: "three_doors_probe" };
  const companions = new Map([
    [ID(1), VETO_EFFECT],
    [ID(2), FAVOUR_EFFECT],
    [ID(3), DOORS],
  ]);
  const docOfAll = (id: string) => companions.get(id) ?? DOCS.get(id) ?? null;
  const play = (doc: EntryDoc) => runEntryScenarios({ entryId: ID(10), doc, docOf: docOfAll });
  /** Per scenario: every expectation missed, and why a step could not run. */
  const failures = (r: ScenarioRun) => r.reports.map((x) => x.steps.flatMap((st) => [...st.checks.filter((c) => !c.ok), ...(st.broken ? [st.broken] : [])]));
  const carrying = { holder: { carries: [{ entry: "self" as const }] } };

  it("a choice of three: it waits without a game, refuses another draw, and a draw that names one takes it", async () => {
    const doors = effect("doors", [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 3 }] }], [
      scenario(
        [
          { do: "draw", expect: { result: "choosing", offered: 3, game: "none" } },
          { do: "draw", expect: { result: "refused", reason: "ieeDecisionPending", offered: 3 } },
          { do: "use", item: ref("speed_boots"), expect: { result: "refused", reason: "ieeDecisionPending" } },
        ],
        { holder: { carries: [{ entry: "self" }, { entry: ref("speed_boots") }] } },
      ),
      scenario([{ do: "draw", take: "quiet_house", expect: { result: "drawn", game: "quiet_house", offered: 0 } }], carrying),
      // Not one of the three offered: it still waits.
      scenario([{ do: "draw", take: "sky_garden", expect: { result: "choosing", game: "none" } }], carrying),
      // High draws offer the last games left.
      scenario([{ do: "draw", take: "iron_tide", expect: { result: "drawn", game: "iron_tide" } }], { ...carrying, draws: "high" }),
    ]);
    const r = await play(doors);
    expect(failures(r)).toEqual([[], [], [], []]);
    expect(r.ok).toBe(true);
    expect(r.reports[0]!.steps[0]!.observed).toMatchObject({ result: "choosing", offered: 3, game: "none" });
  });

  it("a draw takes the first game left — never one passed, refused with a game in flight; the rival draws their own", async () => {
    const plain = effect("plain", [{ when: "beforeGameRoll", do: [{ op: "poolFavor", factor: 2 }] }], [
      scenario([{ do: "draw", expect: { result: "drawn", game: "gear_run" } }], { holder: { passed: ["starfall", "old_keep", "quiet_house"] } }),
      scenario([{ do: "draw", expect: { result: "refused", reason: "gameAlreadyHaveRoll", game: "starfall" } }], { holder: { game: "starfall" } }),
      scenario([{ do: "draw", by: "rival", expect: { result: "drawn", game: "none" } }]),
      scenario(
        [
          { do: "draw", expect: { game: "starfall" } },
          { do: "roll", outcome: "passed", dice: 3, expect: { game: "none" } },
          { do: "draw", expect: { game: "old_keep" } },
        ],
      ),
      scenario([{ do: "draw", expect: { result: "refused", reason: "catalogAllPlayed" } }], {
        holder: { passed: ["starfall", "old_keep", "quiet_house", "gear_run", "tiny_planet", "iron_tide", "night_shift", "sky_garden"] },
      }),
    ]);
    const r = await play(plain);
    expect(failures(r)).toEqual([[], [], [], [], []]);
  });

  it("what the rules read of the games passed: the last one's genres", async () => {
    const same = effect("same_again", [{ when: "beforeGameRoll", do: [{ op: "poolRequire", genres: "lastPassed" }] }], [
      // Night Shift is horror and action: the first game left with either.
      scenario([{ do: "draw", expect: { game: "starfall" } }], { ...carrying, holder: { ...carrying.holder, passed: ["sky_garden", "night_shift"] } }),
    ]);
    expect(failures(await play(same))).toEqual([[]]);
  });

  it("a use picks for the next game: a genre the draw keeps to, a game it favours; one the pool does not offer is refused", async () => {
    const veto = item("genre_ticket", { activation: "active", charges: 1, target: { who: "self" }, pick: "genre" }, [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: ID(1) }, to: "self" }] }], [
      scenario([{ do: "use", pick: { genre: "horror" }, expect: { result: "used" } }, { do: "draw", expect: { game: "quiet_house" } }], carrying),
      scenario([{ do: "use", pick: { genre: "horror" } }, { do: "draw", expect: { game: "night_shift" } }], { ...carrying, draws: "high" }),
      scenario([{ do: "use", pick: { genre: "jazz" }, expect: { result: "refused", reason: "ieePickInvalid" } }], carrying),
      scenario([{ do: "use", expect: { result: "refused", reason: "ieePickRequired" } }], carrying),
    ]);
    expect(failures(await play(veto))).toEqual([[], [], [], []]);
    const favourite = item("favourite", { activation: "active", charges: 1, target: { who: "self" }, pick: "game" }, [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: ID(2) }, to: "self" }] }], [
      scenario([{ do: "use", pick: { game: "tiny_planet" } }, { do: "draw", expect: { game: "tiny_planet" } }], carrying),
      // A game already passed is not on offer.
      scenario([{ do: "use", pick: { game: "tiny_planet" }, expect: { result: "refused", reason: "ieePickInvalid" } }], {
        holder: { passed: ["tiny_planet"], carries: [{ entry: "self" }] },
      }),
    ]);
    expect(failures(await play(favourite))).toEqual([[], []]);
  });

  it("a reroll replaces the game in flight with the next one; no game, no use; nothing left, nothing spent", async () => {
    const reroll = item("game_reroll", onOpenRoll, [{ when: "onUse", do: [{ op: "rerollGame" }] }], [
      scenario([{ do: "use", expect: { result: "used", game: "old_keep", holder: [{ entry: "self", count: 0 }] } }], {
        holder: { game: "starfall", carries: [{ entry: "self" }] },
      }),
      scenario([{ do: "use", expect: { result: "refused", reason: "ieeItemWrongWindow" } }], carrying),
      scenario([{ do: "use", expect: { result: "refused", reason: "catalogAllPlayed", game: "sky_garden", holder: [{ entry: "self", count: 1 }] } }], {
        holder: { game: "sky_garden", passed: ["starfall", "old_keep", "quiet_house", "gear_run", "tiny_planet", "iron_tide", "night_shift"], carries: [{ entry: "self" }] },
      }),
      // Under a choice of three, the use names the game it takes; one it does not name leaves the choice waiting.
      scenario([{ do: "use", take: "gear_run", expect: { result: "used", game: "gear_run" } }], {
        holder: { game: "starfall", carries: [{ entry: "self" }, { entry: doorsRef }] },
      }),
      scenario([{ do: "use", expect: { result: "used", game: "none", offered: 3 } }], {
        holder: { game: "starfall", carries: [{ entry: "self" }, { entry: doorsRef }] },
      }),
    ]);
    const r = await play(reroll);
    expect(failures(r)).toEqual([[], [], [], [], []]);
    expect(r.ok).toBe(true);
  });

  it("set aside: a new game now, and the game back as the holder's two picks later", async () => {
    const later = item("postponed", onOpenRoll, [{ when: "onUse", do: [{ op: "postponeGame", afterRolls: 2 }] }], [
      scenario(
        [
          { do: "use", expect: { result: "used", game: "old_keep" } },
          { do: "roll", outcome: "passed", dice: 3, expect: { game: "none" } },
          { do: "draw", expect: { result: "drawn", game: "starfall" } },
          { do: "roll", outcome: "passed", dice: 3 },
          { do: "draw", expect: { game: "quiet_house" } },
        ],
        { holder: { game: "starfall", carries: [{ entry: "self" }] } },
      ),
    ]);
    const r = await play(later);
    expect(failures(r)).toEqual([[]]);
    expect(r.ok).toBe(true);
  });
});

describe("entry scenarios — completion conditions (wave C, spec §6.17)", () => {
  const ID = (n: number) => `55555555-5555-4555-8555-5555555555${String(n).padStart(2, "0")}`;
  const hard = (scenarios: ScenarioDoc[]): EntryDoc => ({
    dslVersion: 1,
    kind: "effect",
    slug: "hard_mode_probe",
    name: { ru: "Сложный режим" },
    character: "penalty",
    rarity: "common",
    tags: ["game_condition"],
    duration: { unit: "next_game" },
    stacking: { mode: "refresh" },
    rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: { ru: "На высокой сложности" } }] }],
    scenarios,
  });
  const FREE: EntryDoc = {
    dslVersion: 1,
    kind: "effect",
    slug: "free_probe",
    name: { ru: "Свобода" },
    character: "bonus",
    rarity: "common",
    tags: [],
    duration: { unit: "rolls", count: 3 },
    stacking: { mode: "refresh" },
    rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }],
  };
  const play = (doc: EntryDoc) => runEntryScenarios({ entryId: ID(10), doc, docOf: (id) => (id === ID(1) ? FREE : (DOCS.get(id) ?? null)) });
  const failures = (r: ScenarioRun) => r.reports.map((x) => x.steps.flatMap((st) => [...st.checks.filter((c) => !c.ok), ...(st.broken ? [st.broken] : [])]));

  it("the game drawn holds the condition; reported, it holds none — and the effect is gone with it", async () => {
    const r = await play(
      hard([
        scenario(
          [
            { do: "draw", expect: { result: "drawn", conditions: 1 } },
            { do: "roll", outcome: "passed", dice: 3, expect: { conditions: 0, holder: [{ entry: "self", count: 0 }] } },
            { do: "draw", expect: { conditions: 0 } },
          ],
          { holder: { carries: [{ entry: "self" }] } },
        ),
        // Under an immunity, none; a game given in flight was rolled before it all.
        scenario([{ do: "draw", expect: { conditions: 0 } }], { holder: { carries: [{ entry: "self" }, { entry: { entry: ID(1), slug: "free_probe" } }] } }),
        scenario([{ do: "grant", entry: "self", expect: { conditions: 0 } }], { holder: { game: "starfall" } }),
      ]),
    );
    expect(failures(r)).toEqual([[], [], []]);
    expect(r.ok).toBe(true);
    expect(r.reports[0]!.steps[0]!.observed).toMatchObject({ conditions: 1 });
  });
});

describe("entry scenarios — objects on the board (wave D, spec §6.18)", () => {
  const ID = "66666666-6666-4666-8666-666666666601";
  const SPRING = "66666666-6666-4666-8666-666666666602";
  const item = (slug: string, does: EntryDoc["rules"][number]["do"], scenarios: ScenarioDoc[] = []): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: { ru: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    usage: { activation: "active", window: "anytime", target: { who: "self" }, charges: 1, pick: "cell" },
    rules: [
      { when: "onUse", do: [{ op: "placeObject" }] },
      { when: "onObjectEntered", do: does },
    ],
    scenarios,
  });
  const SPRING_DOC = item("spring_probe", [{ op: "extend", delta: 2 }]);
  const mine = (scenarios: ScenarioDoc[]) => item("mine_probe", [{ op: "stopMove" }, { op: "push", delta: -2 }], scenarios);
  const play = (doc: EntryDoc) => runEntryScenarios({ entryId: ID, doc, docOf: (id) => (id === SPRING ? SPRING_DOC : (DOCS.get(id) ?? null)) });
  const failures = (r: ScenarioRun) => r.reports.map((x) => x.steps.flatMap((st) => [...st.checks.filter((c) => !c.ok), ...(st.broken ? [st.broken] : [])]));
  const carried = { holder: { carries: [{ entry: "self" as const }] } };

  it("the holder places it on the cell picked; the rival's move through it stops there, is thrown back, and it is gone", async () => {
    const r = await play(
      mine([
        scenario(
          [
            { do: "use", pick: { cell: 14 }, expect: { result: "used", objects: 1, holder: [{ entry: "self", count: 0 }] } },
            { do: "roll", by: "rival", outcome: "passed", dice: 5, expect: { rivalPosition: 12, cellFires: false, wheel: "none", objects: 0 } },
            // Gone: the next move goes through.
            { do: "roll", by: "rival", outcome: "passed", dice: 5, expect: { rivalPosition: 17, objects: 0 } },
          ],
          carried,
        ),
      ]),
    );
    expect(failures(r)).toEqual([[]]);
    expect(r.ok).toBe(true);
  });

  it("an object given on the board meets the holder too — its owner's own included — and a longer move lands as usual", async () => {
    const r = await play(
      mine([
        scenario([roll({ position: 11, moved: 1, cellFires: false, objects: 0 })], { objects: [{ entry: "self", cell: 13, owner: "rival" }] }),
        scenario([roll({ position: 13, objects: 0 })], { objects: [{ entry: "self", cell: 15 }] }),
        scenario([roll({ position: 17, moved: 7, cellFires: true, objects: 0 })], { objects: [{ entry: { entry: SPRING, slug: "spring_probe" }, cell: 12 }] }),
        // Out of its way, it stays.
        scenario([roll({ position: 15, objects: 1 })], { objects: [{ entry: "self", cell: 9 }] }),
      ]),
    );
    expect(failures(r)).toEqual([[], [], [], []]);
  });

  it("a cell taken and the objects a player may have are refused at the use; its charge is kept", async () => {
    const r = await play(
      mine([
        scenario([{ do: "use", pick: { cell: 14 }, expect: { result: "refused", reason: "ieeCellUnavailable", objects: 1, holder: [{ entry: "self", count: 1 }] } }], {
          ...carried,
          objects: [{ entry: "self", cell: 14, owner: "rival" }],
        }),
        scenario([{ do: "use", pick: { cell: 14 }, expect: { result: "refused", reason: "ieeObjectLimit", objects: 2 } }], {
          ...carried,
          objects: [
            { entry: "self", cell: 20 },
            { entry: "self", cell: 21 },
          ],
        }),
      ]),
    );
    expect(failures(r)).toEqual([[], []]);
  });

  it("two objects given on one cell cannot be set up", async () => {
    const r = await play(mine([scenario([roll({})], { objects: [{ entry: "self", cell: 14 }, { entry: "self", cell: 14, owner: "rival" }] })]));
    expect(r.ok).toBe(false);
    expect(r.reports[0]!.steps[0]!.broken).toEqual({ reason: "object_cell", params: { cell: "14" } });
    expect(scenarioIssues(r)).toMatchObject([{ code: "scenario_broken", params: { reason: "object_cell", cell: "14" } }]);
  });
});

describe("entry scenarios — the same cell (wave D, spec §6.19)", () => {
  const ID = "66666666-6666-4666-8666-666666666611";
  const crown = (scenarios: ScenarioDoc[]): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug: "crown_probe",
    name: { ru: "Корона" },
    character: "bonus",
    rarity: "epic",
    tags: [],
    usage: { activation: "passive", unique: "season" },
    rules: [
      { when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: 1 }] },
      { when: "onSameCell", do: [{ op: "takeEntry" }] },
    ],
    scenarios,
  });
  const play = (doc: EntryDoc) => runEntryScenarios({ entryId: ID, doc, docOf });
  const failures = (r: ScenarioRun) => r.reports.map((x) => x.steps.flatMap((st) => [...st.checks.filter((c) => !c.ok), ...(st.broken ? [st.broken] : [])]));
  const carried = { carries: [{ entry: "self" as const }] };

  it("the rival who ends a move on the holder's cell takes it; the holder's own move onto theirs, or a move ending elsewhere, does not", async () => {
    const r = await play(
      crown([
        scenario([roll({ rivalPosition: 10, holder: [{ entry: "self", count: 0 }], rival: [{ entry: "self", count: 1 }] }, { by: "rival", dice: 3 })], {
          holder: carried,
          rival: { position: 7 },
        }),
        // Held while the holder plays: +1 on a pass, and onto the rival's cell it goes with them.
        scenario([roll({ moved: 2, position: 12, holder: [{ entry: "self", count: 1 }], rival: [{ entry: "self", count: 0 }] }, { dice: 1 })], { holder: carried }),
        scenario([roll({ rivalPosition: 11, holder: [{ entry: "self", count: 1 }] }, { by: "rival", dice: 4 })], { holder: carried, rival: { position: 7 } }),
      ]),
    );
    expect(failures(r)).toEqual([[], [], []]);
  });

  it("a second one is never handed out", async () => {
    const r = await play(crown([scenario([{ do: "grant", entry: "self", to: "rival", expect: { result: "refused", rival: [{ entry: "self", count: 0 }] } }], { holder: carried })]));
    expect(failures(r)).toEqual([[]]);
  });
});

