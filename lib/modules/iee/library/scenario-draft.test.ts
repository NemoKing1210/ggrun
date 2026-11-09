import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc, ScenarioDoc, ScenarioEntry, ScenarioStep, StepObservation } from "@/lib/engine/iee/dsl";
import type { ScenarioRun } from "@/lib/modules/iee/sim/scenarios";

import {
  STEP_CHECKS,
  acceptCheck,
  addCheck,
  addObservedCheck,
  checksOf,
  cleanScenario,
  defaultCheck,
  defaultStep,
  draftPlayKey,
  editorRun,
  newScenario,
  nextScenarioId,
  observedValue,
  removeCheck,
  scenarioOf,
  scenarioVerdict,
  setCheck,
  updateScenario,
  updateStep,
  withStepKind,
} from "./scenario-draft";

const SELF = "33333333-3333-4333-8333-333333333333";
const docOf = (key: CoreKey): EntryDoc => structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);
const idOf = (e: ScenarioEntry) => (e === "self" ? SELF : e.entry);
const slugOf = (id: string) => (id === SELF ? "swamp" : id);

const roll = (dice: number, expect: Record<string, unknown> = {}): ScenarioStep =>
  ({ do: "roll", outcome: "passed", dice, expect }) as ScenarioStep;

const seen = (over: Partial<StepObservation> = {}): StepObservation => ({
  position: 10,
  rivalPosition: 12,
  moved: 4,
  diceCount: 1,
  diceSides: 6,
  cellFires: true,
  wheel: "none",
  balance: 0,
  rivalBalance: 0,
  holder: {},
  rival: {},
  ...over,
});

describe("scenarioOf / cleanScenario — a stored scenario in and out of the editor", () => {
  it("reads what it can and drops steps that are not one", () => {
    const s = scenarioOf({
      id: "SC-A-1",
      title: { ru: "Раз", en: 2 },
      note: { ru: "почему" },
      given: { sides: 8 },
      steps: [
        { do: "roll", dice: "x", by: "someone", outcome: "dropped", cell: "bonus", expect: { moved: -2 } },
        { do: "use", item: { entry: "e1", slug: "boots" }, on: "rival" },
        { do: "grant", entry: { entry: "e2" }, to: "rival" },
        { do: "dance" },
        "nope",
      ],
    })!;
    expect(s.title).toEqual({ ru: "Раз" });
    expect(s.note).toEqual({ ru: "почему" });
    expect(s.given).toEqual({ sides: 8 });
    expect(s.steps).toEqual([
      { do: "roll", outcome: "dropped", dice: 4, cell: "bonus", expect: { moved: -2 } },
      { do: "use", item: { entry: "e1", slug: "boots" }, on: "rival" },
      { do: "grant", entry: { entry: "e2" }, to: "rival" },
    ]);
    expect(scenarioOf("nope")).toBeNull();
    expect(scenarioOf({ steps: "x" })).toEqual({ title: { ru: "" }, steps: [] });
  });

  it("saves trimmed texts and nothing empty: blank rows must not change the hash", () => {
    const s: ScenarioDoc = {
      id: "  ",
      title: { ru: " Раз ", en: "  ", uk: " Один " },
      note: { ru: "  " },
      given: {
        holder: { carries: [], inFlight: false },
        rival: { left: false, balance: 3 },
        loop: false,
        draws: "low",
      },
      steps: [roll(4, { holder: [], moved: 4 }), roll(4, { rival: [] })],
    };
    expect(cleanScenario(s)).toEqual({
      title: { ru: "Раз", uk: "Один" },
      given: { rival: { balance: 3 } },
      steps: [roll(4, { moved: 4 }), { do: "roll", outcome: "passed", dice: 4 }],
    });
    expect(cleanScenario({ title: { ru: "" }, given: { sides: 8, loop: true, draws: "high" }, steps: [] })).toEqual({
      title: { ru: "" },
      given: { sides: 8, loop: true, draws: "high" },
      steps: [],
    });
  });
});

describe("new scenarios and steps", () => {
  it("an item's scenario uses it; an effect's is a turn with it in force", () => {
    expect(newScenario(docOf("hex_scroll")).steps).toEqual([{ do: "use", expect: { result: "used" } }]);
    expect(newScenario(docOf("swamp"))).toEqual({
      title: { ru: "" },
      given: { holder: { carries: [{ entry: "self" }] } },
      steps: [roll(4, { moved: 4 })],
    });
    // An effect is used through an item it names.
    expect(defaultStep(docOf("swamp"), "use")).toEqual({ do: "use", item: { entry: "" }, expect: { result: "used" } });
    expect(defaultStep(docOf("swamp"), "grant")).toEqual({ do: "grant", entry: "self", expect: { result: "granted" } });
  });

  it("a copy takes the next free code after its source's", () => {
    const doc = { ...docOf("swamp") };
    expect(nextScenarioId(doc, "SC-SWAMP-1")).toBe("SC-SWAMP-5");
    expect(nextScenarioId(doc, "SC-OTHER")).toBe("SC-OTHER-2");
    expect(nextScenarioId(doc, undefined)).toBeUndefined();
    expect(nextScenarioId(doc, "bad id")).toBeUndefined();
  });

  it("switching a step's kind keeps the checks the new kind can make", () => {
    const doc = docOf("swamp");
    const step = roll(4, { moved: 4, balance: 2, holder: [{ entry: "self", count: 1 }] });
    expect(withStepKind(doc, step, "grant")).toEqual({
      do: "grant",
      entry: "self",
      expect: { result: "granted", balance: 2, holder: [{ entry: "self", count: 1 }] },
    });
    expect(withStepKind(doc, step, "roll")).toBe(step);
  });

  it("updates one scenario or one step and leaves the rest as they are", () => {
    const doc = docOf("swamp");
    const next = updateStep(doc, 1, 0, (s) => ({ ...s, dice: 6 }) as ScenarioStep);
    expect((next.scenarios![1]!.steps[0] as { dice: number }).dice).toBe(6);
    expect(next.scenarios![0]).toBe(doc.scenarios![0]);
    expect(updateScenario(doc, 99, (s) => s)).toBe(doc);
    expect(updateStep(doc, 0, 99, (s) => s)).toEqual(doc);
  });
});

describe("checks", () => {
  it("start from a value that fits the step", () => {
    const pass = roll(5);
    const drop = { do: "roll", outcome: "dropped", dice: 7 } as ScenarioStep;
    expect(defaultCheck("moved", pass)).toBe(5);
    expect(defaultCheck("moved", drop)).toBe(-7);
    expect(defaultCheck("diceCount", drop)).toBe(2);
    expect(defaultCheck("diceCount", pass)).toBe(1);
    expect(defaultCheck("result", { do: "grant", entry: "self" })).toBe("granted");
    expect(defaultCheck("holder", pass)).toEqual([{ entry: "self", count: 1 }]);
  });

  it("a refusal's reason makes the use refused; a holdings check adds a row", () => {
    const use: ScenarioStep = { do: "use", expect: { result: "used" } };
    expect(addCheck(use, "reason").expect).toEqual({ result: "refused", reason: "ieeItemNotFound" });
    const twice = addCheck(addCheck(roll(4), "holder"), "holder");
    expect(twice.expect?.holder).toHaveLength(2);
    expect(removeCheck(twice, "holder", 0).expect?.holder).toHaveLength(1);
    expect(removeCheck(removeCheck(twice, "holder", 0), "holder", 0).expect).toEqual({});
    expect(removeCheck(roll(4, { moved: 4 }), "moved").expect).toEqual({});
    expect(setCheck(roll(4), "wheel", "bonus").expect).toEqual({ wheel: "bonus" });
  });

  it("a use keeps what it picks from the catalog; a roll may check the wheel spun once more (spec §6.12)", () => {
    const s = scenarioOf({
      title: { ru: "x" },
      steps: [
        { do: "use", chooseEntry: { entry: "e3", slug: "boots" }, choose: "self" },
        { do: "use", chooseEntry: 7 },
      ],
    })!;
    expect(s.steps).toEqual([{ do: "use", choose: "self", chooseEntry: { entry: "e3", slug: "boots" } }, { do: "use" }]);
    // Who uses it and how an entry is handed out (wave B, spec §6.13): kept when they are what they may be.
    const b = scenarioOf({
      title: { ru: "x" },
      steps: [
        { do: "use", by: "rival" },
        { do: "use", by: "judge" },
        { do: "grant", entry: "self", via: "wheel" },
        { do: "grant", entry: "self", via: "mail" },
      ],
    })!;
    expect(b.steps).toEqual([{ do: "use", by: "rival" }, { do: "use" }, { do: "grant", entry: "self", via: "wheel" }, { do: "grant", entry: "self" }]);
    expect(STEP_CHECKS.roll).toContain("wheelAgain");
    expect(addCheck(roll(4), "wheelAgain").expect).toEqual({ wheelAgain: "none" });
  });

  it("a choice is answered by a step of its own, and any step may check whether one waits (wave B, spec §7.6)", () => {
    const s = scenarioOf({
      title: { ru: "x" },
      steps: [
        { do: "decide", by: "rival", option: "discard", picks: ["self", { entry: "e4", slug: "boots" }], expect: { result: "decided" } },
        { do: "decide", by: "nobody", option: "throw", picks: [] },
      ],
    })!;
    expect(s.steps).toEqual([
      { do: "decide", by: "rival", option: "discard", picks: ["self", { entry: "e4", slug: "boots" }], expect: { result: "decided" } },
      { do: "decide" },
    ]);
    const doc = docOf("swamp");
    expect(defaultStep(doc, "decide")).toEqual({ do: "decide", expect: { result: "decided" } });
    expect(defaultCheck("result", { do: "decide" })).toBe("decided");
    expect(defaultCheck("decision", { do: "decide" })).toBe("none");
    expect(defaultCheck("decision", { do: "grant", entry: "self" })).toBe("pending");
    for (const kind of ["roll", "use", "grant", "decide"] as const) expect(STEP_CHECKS[kind]).toContain("decision");
    // A grant switched to a choice keeps what a choice can check — not its result, which is the grant's word.
    expect(withStepKind(doc, { do: "grant", entry: "self", expect: { result: "granted", decision: "pending", balance: 0 } }, "decide")).toEqual({
      do: "decide",
      expect: { result: "decided", decision: "pending", balance: 0 },
    });
    expect(withStepKind(doc, { do: "use", expect: { result: "refused", reason: "ieeItemNotFound" } }, "grant")).toEqual({
      do: "grant",
      entry: "self",
      expect: { result: "granted" },
    });
  });

  it("a roll keeps the reaction it names, and may check the window (wave B, spec §7.4)", () => {
    const s = scenarioOf({
      title: { ru: "x" },
      steps: [
        { do: "roll", outcome: "passed", dice: 2, then: [6], react: "self", expect: { window: "used" } },
        { do: "roll", outcome: "passed", dice: 2, react: { entry: "e4", slug: "coin" } },
        { do: "roll", outcome: "passed", dice: 2, react: 7 },
      ],
    })!;
    expect(s.steps).toEqual([
      { do: "roll", outcome: "passed", dice: 2, then: [6], react: "self", expect: { window: "used" } },
      { do: "roll", outcome: "passed", dice: 2, react: { entry: "e4", slug: "coin" } },
      { do: "roll", outcome: "passed", dice: 2 },
    ]);
    expect(STEP_CHECKS.roll).toContain("window");
    expect(STEP_CHECKS.use).not.toContain("window");
    expect(defaultCheck("window", { do: "roll", outcome: "passed", dice: 2, react: "self" })).toBe("used");
    expect(defaultCheck("window", { do: "roll", outcome: "passed", dice: 2 })).toBe("none");
  });

  it("lists a step's checks in the editor's order", () => {
    expect(checksOf(roll(4, { rival: [], wheel: "none", moved: 4 }))).toEqual(["moved", "wheel", "rival"]);
    expect(STEP_CHECKS.use).not.toContain("moved");
  });

  it("a new check starts from what the last run saw", () => {
    expect(addObservedCheck(roll(4), "moved", seen({ moved: 3 })).expect).toEqual({ moved: 3 });
    expect(addObservedCheck(roll(4), "moved", null).expect).toEqual({ moved: 4 });
    // A use that went through has no refusal to start from.
    const use: ScenarioStep = { do: "use" };
    expect(addObservedCheck(use, "reason", seen({ result: "used", reason: null })).expect).toEqual({
      result: "refused",
      reason: "ieeItemNotFound",
    });
    expect(addObservedCheck(use, "reason", seen({ result: "refused", reason: "ieeTargetProtected" })).expect).toEqual({
      result: "refused",
      reason: "ieeTargetProtected",
    });
    // Checking that it went through drops a reason it cannot have.
    const refused: ScenarioStep = { do: "use", expect: { reason: "ieeTargetProtected" } };
    expect(addObservedCheck(refused, "result", seen({ result: "used", reason: null })).expect).toEqual({ result: "used" });
    expect(observedValue("holder", seen(), roll(4))).toBeUndefined();
    expect(observedValue("reason", seen({ reason: "ieeTargetProtected" }), roll(4))).toBeUndefined();
  });

  it("taking what happened sets the expectation to it", () => {
    const step = roll(4, { moved: 4, holder: [{ entry: "self", count: 1 }, { entry: { entry: "e2" }, count: 2 }] });
    expect(acceptCheck(step, { field: "moved", expected: 4, actual: 3, ok: false }).expect).toMatchObject({ moved: 3 });
    const held = acceptCheck(step, { field: "holder", entry: { id: "e2", slug: "e2" }, expected: 2, actual: 0, ok: false }, 1);
    expect(held.expect?.holder).toEqual([{ entry: "self", count: 1 }, { entry: { entry: "e2" }, count: 0 }]);
    // Without its row a holdings check is left alone.
    expect(acceptCheck(step, { field: "holder", expected: 1, actual: 0, ok: false })).toBe(step);
    // A use that went through: no reason, and the result says so.
    const use: ScenarioStep = { do: "use", expect: { result: "refused", reason: "ieeTargetProtected" } };
    expect(acceptCheck(use, { field: "reason", expected: "ieeTargetProtected", actual: null, ok: false }).expect).toEqual({ result: "refused" });
    expect(acceptCheck(use, { field: "result", expected: "refused", actual: "used", ok: false }).expect).toEqual({ result: "used" });
  });
});

describe("the next game (wave C, spec §5.5, §7.12)", () => {
  it("a draw is a step of its own: it keeps whose game and the game taken while they are one", () => {
    const s = scenarioOf({
      title: { ru: "x" },
      steps: [
        { do: "draw", by: "rival", take: "old_keep", expect: { result: "choosing", offered: 3 } },
        { do: "draw", by: "nobody", take: "pong" },
        { do: "use", pick: { genre: "horror" }, take: "gear_run" },
        { do: "use", pick: { genre: "Horror" }, take: 4 },
        { do: "use", pick: { years: [1990, 1999] } },
        { do: "use", pick: { years: [1999, 1990] } },
        { do: "use", pick: { game: "tiny_planet" } },
      ],
    })!;
    expect(s.steps).toEqual([
      { do: "draw", by: "rival", take: "old_keep", expect: { result: "choosing", offered: 3 } },
      { do: "draw" },
      { do: "use", pick: { genre: "horror" }, take: "gear_run" },
      { do: "use" },
      { do: "use", pick: { years: [1990, 1999] } },
      { do: "use" },
      { do: "use", pick: { game: "tiny_planet" } },
    ]);
    const doc = docOf("swamp");
    expect(defaultStep(doc, "draw")).toEqual({ do: "draw", expect: { result: "drawn" } });
    expect(STEP_CHECKS.draw).toEqual(expect.arrayContaining(["result", "reason", "game", "offered", "decision", "holder"]));
    expect(STEP_CHECKS.draw).not.toContain("moved");
    for (const kind of ["roll", "use", "grant", "decide", "draw"] as const) expect(STEP_CHECKS[kind]).toEqual(expect.arrayContaining(["game", "offered"]));
  });

  it("checks start from what a draw promises: the first game, a choice of two; other steps, no game and no choice", () => {
    const draw: ScenarioStep = { do: "draw" };
    expect(defaultCheck("result", draw)).toBe("drawn");
    expect(defaultCheck("reason", draw)).toBe("gameAlreadyHaveRoll");
    expect(defaultCheck("game", draw)).toBe("starfall");
    expect(defaultCheck("offered", draw)).toBe(2);
    expect(defaultCheck("game", { do: "use" })).toBe("none");
    expect(defaultCheck("offered", { do: "use" })).toBe(0);
    expect(addCheck(draw, "reason").expect).toEqual({ reason: "gameAlreadyHaveRoll", result: "refused" });
    // What the run saw: its refusal, its game.
    expect(observedValue("reason", seen({ result: "refused", reason: "catalogAllPlayed" }), draw)).toBe("catalogAllPlayed");
    expect(addObservedCheck(draw, "game", seen({ game: "quiet_house" })).expect).toEqual({ game: "quiet_house" });
    // A draw that went through has no reason.
    const refused: ScenarioStep = { do: "draw", expect: { result: "refused", reason: "ieeDecisionPending" } };
    expect(addObservedCheck(refused, "result", seen({ result: "choosing", reason: null })).expect).toEqual({ result: "choosing" });
    expect(acceptCheck(refused, { field: "result", expected: "refused", actual: "drawn", ok: false }).expect).toEqual({ result: "drawn" });
    // A use switched to a draw keeps the game it checks, not its result.
    expect(withStepKind(docOf("swamp"), { do: "use", expect: { result: "used", game: "old_keep", offered: 0 } }, "draw")).toEqual({
      do: "draw",
      expect: { result: "drawn", game: "old_keep", offered: 0 },
    });
  });

  it("any step may check the conditions on the holder's game: a draw most often promises one (spec §6.17)", () => {
    for (const kind of ["roll", "use", "grant", "decide", "draw"] as const) expect(STEP_CHECKS[kind]).toContain("conditions");
    expect(defaultCheck("conditions", { do: "draw" })).toBe(1);
    expect(defaultCheck("conditions", roll(4))).toBe(0);
    expect(addObservedCheck({ do: "draw" }, "conditions", seen({ conditions: 2 })).expect).toEqual({ conditions: 2 });
  });

  it("any step may check the objects on the board: a use most often places one, a roll meets it (wave D, spec §6.18)", () => {
    for (const kind of ["roll", "use", "grant", "decide", "draw"] as const) expect(STEP_CHECKS[kind]).toContain("objects");
    expect(defaultCheck("objects", { do: "use", pick: { cell: 14 } })).toBe(1);
    expect(defaultCheck("objects", roll(4))).toBe(0);
    expect(addObservedCheck(roll(4), "objects", seen({ objects: 2 })).expect).toEqual({ objects: 2 });
  });

  it("a new use of an item that stands on the board picks a cell and promises the object", () => {
    const placing: EntryDoc = { ...docOf("speed_boots"), usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "cell" } };
    expect(defaultStep(placing, "use")).toEqual({ do: "use", pick: { cell: 14 }, expect: { result: "used", objects: 1 } });
    expect(defaultStep(docOf("speed_boots"), "use")).toEqual({ do: "use", expect: { result: "used" } });
  });

  it("saves the objects given — the holder's spelled out as nothing — and no empty list of them", () => {
    const clean = (objects: NonNullable<NonNullable<ScenarioDoc["given"]>["objects"]>) =>
      cleanScenario({ title: { ru: "x" }, given: { objects }, steps: [{ do: "roll", outcome: "passed", dice: 3 }] }).given;
    expect(clean([{ entry: "self", cell: 12, owner: "holder" }, { entry: "self", cell: 14, owner: "rival" }])).toEqual({
      objects: [{ entry: "self", cell: 12 }, { entry: "self", cell: 14, owner: "rival" }],
    });
    expect(clean([])).toBeUndefined();
  });

  it("saves the games given, and no empty list of games passed", () => {
    const clean = cleanScenario({
      title: { ru: "x" },
      given: { holder: { game: "starfall", passed: [] }, rival: { passed: ["sky_garden"] } },
      steps: [{ do: "draw" }],
    });
    expect(clean.given).toEqual({ holder: { game: "starfall" }, rival: { passed: ["sky_garden"] } });
  });
});

describe("the last run against the scenarios as they are now", () => {
  const doc = (): EntryDoc => ({
    ...docOf("swamp"),
    scenarios: [
      { title: { ru: "Один" }, given: { holder: { carries: [{ entry: "self" }] } }, steps: [roll(5, { moved: 4 })] },
      { title: { ru: "Два" }, steps: [roll(5, { moved: 5 }), roll(5, { moved: 5 })] },
    ],
  });
  const run = (): ScenarioRun => ({
    ok: false,
    reports: [
      { index: 0, id: null, title: { ru: "Один" }, ok: true, steps: [{ index: 0, ok: true, checks: [], observed: seen({ moved: 4 }) }] },
      {
        index: 1,
        id: null,
        title: { ru: "Два" },
        ok: false,
        steps: [{ index: 0, ok: false, broken: { reason: "not_in_run", params: { who: "holder" } }, checks: [], observed: null }],
      },
    ],
  });

  it("nothing is known before a run, and a change to the rules makes it stale", () => {
    const d = doc();
    expect(scenarioVerdict(null, draftPlayKey(d), d.scenarios![0]!, 0, idOf, slugOf)).toEqual({ status: "notRun", steps: [] });
    const held = editorRun(d, run());
    const changed = { ...d, rules: [] };
    expect(scenarioVerdict(held, draftPlayKey(changed), d.scenarios![0]!, 0, idOf, slugOf).status).toBe("stale");
    // A name or a scenario is not what the entry plays.
    expect(draftPlayKey({ ...d, name: { ru: "Трясина" }, scenarios: [] })).toBe(draftPlayKey(d));
  });

  it("re-checks an edited expectation without a new run", () => {
    const d = doc();
    const held = editorRun(d, run());
    const key = draftPlayKey(d);
    expect(scenarioVerdict(held, key, d.scenarios![0]!, 0, idOf, slugOf)).toMatchObject({ status: "green", steps: [{ ran: true, ok: true }] });
    const edited = { ...d.scenarios![0]!, steps: [roll(5, { moved: 9 })] };
    const verdict = scenarioVerdict(held, key, edited, 0, idOf, slugOf);
    expect(verdict.status).toBe("red");
    expect(verdict.steps[0]!.checks).toEqual([{ field: "moved", expected: 9, actual: 4, ok: false }]);
  });

  it("follows a scenario that moved; one that plays differently was not run", () => {
    const d = doc();
    const held = editorRun(d, run());
    const key = draftPlayKey(d);
    expect(scenarioVerdict(held, key, d.scenarios![0]!, 3, idOf, slugOf).status).toBe("green");
    expect(scenarioVerdict(held, key, { ...d.scenarios![0]!, steps: [roll(6, { moved: 4 })] }, 0, idOf, slugOf).status).toBe("notRun");
  });

  it("a step that could not run says why; the steps after it were not reached", () => {
    const d = doc();
    const verdict = scenarioVerdict(editorRun(d, run()), draftPlayKey(d), d.scenarios![1]!, 1, idOf, slugOf);
    expect(verdict.status).toBe("red");
    expect(verdict.steps).toEqual([
      { ran: true, broken: { reason: "not_in_run", params: { who: "holder" } }, observed: null, checks: [], ok: false },
      { ran: false, observed: null, checks: [], ok: false },
    ]);
  });

  it("a report of a scenario the draft no longer has keys nothing", () => {
    const d = doc();
    const held = editorRun({ ...d, scenarios: [d.scenarios![0]!] }, run());
    expect(held.reports[1]!.playKey).toBe("");
  });
});
