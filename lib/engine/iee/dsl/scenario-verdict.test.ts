import { describe, expect, it } from "vitest";

import type { ScenarioDoc, ScenarioEntry, ScenarioStep } from "./doc";
import { compareStep, scenarioPlayKey, type StepObservation } from "./scenario-verdict";

const SELF = "11111111-1111-4111-8111-111111111111";
const SWAMP = "22222222-2222-4222-8222-222222222222";
const idOf = (e: ScenarioEntry) => (e === "self" ? SELF : e.entry);
const slugOf = (id: string) => (id === SELF ? "boots" : id === SWAMP ? "swamp" : id);

const seen = (over: Partial<StepObservation> = {}): StepObservation => ({
  position: 10,
  rivalPosition: 12,
  moved: 3,
  diceCount: 1,
  diceSides: 6,
  cellFires: true,
  wheel: "none",
  balance: 0,
  rivalBalance: 0,
  holder: { [SWAMP]: 1 },
  rival: {},
  ...over,
});

describe("compareStep — each expectation against what the step did", () => {
  it("compares the plain fields it checks, and only those", () => {
    const step: ScenarioStep = { do: "roll", outcome: "passed", dice: 4, expect: { moved: 4, wheel: "none" } };
    expect(compareStep(step, seen(), idOf, slugOf)).toEqual([
      { field: "moved", expected: 4, actual: 3, ok: false },
      { field: "wheel", expected: "none", actual: "none", ok: true },
    ]);
  });

  it("counts an entry in a holdings list; one it never saw counts zero", () => {
    const step: ScenarioStep = {
      do: "roll",
      outcome: "passed",
      dice: 4,
      expect: { holder: [{ entry: { entry: SWAMP }, count: 1 }, { entry: "self", count: 0 }], rival: [{ entry: { entry: SWAMP }, count: 1 }] },
    };
    expect(compareStep(step, seen(), idOf, slugOf)).toEqual([
      { field: "holder", entry: { id: SWAMP, slug: "swamp" }, expected: 1, actual: 1, ok: true },
      { field: "holder", entry: { id: SELF, slug: "boots" }, expected: 0, actual: 0, ok: true },
      { field: "rival", entry: { id: SWAMP, slug: "swamp" }, expected: 1, actual: 0, ok: false },
    ]);
  });

  it("a value the step did not produce is nothing", () => {
    const step: ScenarioStep = { do: "use", expect: { result: "refused", reason: "ieeItemWrongWindow" } };
    const checks = compareStep(step, seen({ result: "used", reason: null }), idOf, slugOf);
    expect(checks.map((c) => [c.field, c.actual, c.ok])).toEqual([
      ["result", "used", false],
      ["reason", null, false],
    ]);
  });

  it("checks the wheel a rule spun once more beside the landing's own (spec §6.12)", () => {
    const step: ScenarioStep = { do: "roll", outcome: "passed", dice: 4, cell: "bonus", expect: { wheel: "bonus", wheelAgain: "bonus" } };
    expect(compareStep(step, seen({ wheel: "bonus", wheelAgain: "none" }), idOf, slugOf)).toEqual([
      { field: "wheel", expected: "bonus", actual: "bonus", ok: true },
      { field: "wheelAgain", expected: "bonus", actual: "none", ok: false },
    ]);
  });

  it("checks whether a reaction window opened, and how it was answered (wave B, spec §7.4)", () => {
    const step: ScenarioStep = { do: "roll", outcome: "passed", dice: 2, react: "self", expect: { window: "used" } };
    expect(compareStep(step, seen({ window: "accepted" }), idOf, slugOf)).toEqual([{ field: "window", expected: "used", actual: "accepted", ok: false }]);
  });

  it("a step that checks nothing has no checks", () => {
    expect(compareStep({ do: "grant", entry: "self" }, seen(), idOf, slugOf)).toEqual([]);
  });
});

describe("scenarioPlayKey — what plays, as a string", () => {
  const base: ScenarioDoc = {
    title: { ru: "Короче на клетку" },
    given: { holder: { carries: [{ entry: "self" }] } },
    steps: [{ do: "roll", outcome: "passed", dice: 5, expect: { moved: 4 } }],
  };

  it("ignores the title, the note, the id and every expectation", () => {
    const other: ScenarioDoc = {
      ...base,
      id: "SC-X-1",
      title: { ru: "Другое", en: "Other" },
      note: { ru: "почему" },
      steps: [{ do: "roll", outcome: "passed", dice: 5, expect: { moved: 9, wheel: "bonus" } }],
    };
    expect(scenarioPlayKey(other)).toBe(scenarioPlayKey(base));
  });

  it("spells the scenario season's defaults out: saying them changes nothing", () => {
    const explicit: ScenarioDoc = {
      ...base,
      given: {
        holder: { position: 10, balance: 5, inFlight: false, carries: [{ entry: "self", count: 1 }] },
        rival: { position: 12, balance: 5, left: false },
        sides: 6,
        loop: false,
        draws: "low",
      },
      steps: [{ do: "roll", by: "holder", outcome: "passed", dice: 5, cell: "normal" }],
    };
    expect(scenarioPlayKey(explicit)).toBe(scenarioPlayKey(base));
    expect(scenarioPlayKey({ ...base, given: undefined })).not.toBe(scenarioPlayKey(base));
  });

  it("changes with what the steps do and with the Given", () => {
    const key = scenarioPlayKey(base);
    expect(scenarioPlayKey({ ...base, steps: [{ do: "roll", outcome: "passed", dice: 6 }] })).not.toBe(key);
    expect(scenarioPlayKey({ ...base, steps: [{ do: "roll", outcome: "dropped", dice: 5 }] })).not.toBe(key);
    expect(scenarioPlayKey({ ...base, given: { ...base.given, draws: "high" } })).not.toBe(key);
    expect(scenarioPlayKey({ ...base, given: { holder: { carries: [{ entry: "self", count: 2 }] } } })).not.toBe(key);
    const use: ScenarioDoc = { ...base, steps: [{ do: "use" }] };
    expect(scenarioPlayKey({ ...use, steps: [{ do: "use", on: "rival" }] })).not.toBe(scenarioPlayKey(use));
    // What a use picks plays differently too (spec §6.10, §6.12).
    expect(scenarioPlayKey({ ...use, steps: [{ do: "use", choose: { entry: SWAMP } }] })).not.toBe(scenarioPlayKey(use));
    expect(scenarioPlayKey({ ...use, steps: [{ do: "use", chooseEntry: { entry: SWAMP } }] })).not.toBe(scenarioPlayKey(use));
    const grant: ScenarioDoc = { ...base, steps: [{ do: "grant", entry: "self" }] };
    expect(scenarioPlayKey({ ...grant, steps: [{ do: "grant", entry: "self", to: "holder" }] })).toBe(scenarioPlayKey(grant));
    expect(scenarioPlayKey({ ...grant, steps: [{ do: "grant", entry: { entry: SWAMP } }] })).not.toBe(scenarioPlayKey(grant));
  });

  it("who uses an item and how an entry is handed out play differently — a step without them keys as before (wave B)", () => {
    const use: ScenarioDoc = { ...base, steps: [{ do: "use" }] };
    expect(scenarioPlayKey({ ...use, steps: [{ do: "use", by: "rival" }] })).not.toBe(scenarioPlayKey(use));
    const grant: ScenarioDoc = { ...base, steps: [{ do: "grant", entry: "self" }] };
    expect(scenarioPlayKey({ ...grant, steps: [{ do: "grant", entry: "self", via: "wheel" }] })).not.toBe(scenarioPlayKey(grant));
  });

  it("a choice keys by who answers, the option and the picks — the default spelled out (spec §7.6)", () => {
    const decide: ScenarioDoc = { ...base, steps: [{ do: "decide" }] };
    expect(scenarioPlayKey({ ...decide, steps: [{ do: "decide", by: "holder", expect: { result: "decided" } }] })).toBe(scenarioPlayKey(decide));
    expect(scenarioPlayKey({ ...decide, steps: [{ do: "decide", by: "rival" }] })).not.toBe(scenarioPlayKey(decide));
    expect(scenarioPlayKey({ ...decide, steps: [{ do: "decide", option: "endure" }] })).not.toBe(scenarioPlayKey(decide));
    const picked = { ...decide, steps: [{ do: "decide" as const, option: "discard" as const, picks: [{ entry: SWAMP }] }] };
    expect(scenarioPlayKey({ ...decide, steps: [{ do: "decide", option: "discard", picks: ["self"] }] })).not.toBe(scenarioPlayKey(picked));
  });
});

describe("compareStep — what waits for the holder (wave B, spec §7.6)", () => {
  it("checks whether a choice waits, and a choice's result", () => {
    const step: ScenarioStep = { do: "decide", expect: { result: "decided", decision: "none" } };
    expect(compareStep(step, seen({ result: "decided", decision: "pending" }), idOf, slugOf)).toEqual([
      { field: "result", expected: "decided", actual: "decided", ok: true },
      { field: "decision", expected: "none", actual: "pending", ok: false },
    ]);
  });
});

describe("the next game in a scenario (wave C, spec §5.5, §7.12)", () => {
  const base: ScenarioDoc = { title: { ru: "Три двери" }, steps: [{ do: "draw" }] };

  it("checks how many completion conditions the holder's game holds (spec §6.17)", () => {
    const step: ScenarioStep = { do: "draw", expect: { conditions: 1 } };
    expect(compareStep(step, seen({ conditions: 1 }), idOf, slugOf)).toEqual([{ field: "conditions", expected: 1, actual: 1, ok: true }]);
    expect(compareStep(step, seen({ conditions: 0 }), idOf, slugOf)[0]).toMatchObject({ ok: false, actual: 0 });
  });

  it("checks the holder's game in flight and how many games their choice offers", () => {
    const step: ScenarioStep = { do: "draw", expect: { result: "choosing", game: "none", offered: 3 } };
    expect(compareStep(step, seen({ result: "choosing", game: "none", offered: 3 }), idOf, slugOf).every((c) => c.ok)).toBe(true);
    const missed = compareStep(step, seen({ result: "drawn", game: "starfall", offered: 0 }), idOf, slugOf).filter((c) => !c.ok);
    expect(missed.map((c) => [c.field, c.expected, c.actual])).toEqual([
      ["result", "choosing", "drawn"],
      ["game", "none", "starfall"],
      ["offered", 3, 0],
    ]);
  });

  it("a draw keys by whose game is picked and the game taken — the holder spelled out", () => {
    const key = scenarioPlayKey(base);
    expect(scenarioPlayKey({ ...base, steps: [{ do: "draw", by: "holder", expect: { result: "drawn" } }] })).toBe(key);
    expect(scenarioPlayKey({ ...base, steps: [{ do: "draw", by: "rival" }] })).not.toBe(key);
    expect(scenarioPlayKey({ ...base, steps: [{ do: "draw", take: "old_keep" }] })).not.toBe(key);
  });

  it("the games given and a use's pick and take play differently; a scenario without them keys as before", () => {
    const plain: ScenarioDoc = { title: { ru: "x" }, steps: [{ do: "use" }] };
    const key = scenarioPlayKey(plain);
    expect(key).not.toMatch(/"(game|passed|pick|take|lastRoll)"/);
    const playing = scenarioPlayKey({ ...plain, given: { holder: { game: "starfall" } } });
    expect(playing).not.toBe(key);
    // A game given is a game in flight: saying so changes nothing.
    expect(scenarioPlayKey({ ...plain, given: { holder: { game: "starfall", inFlight: true } } })).toBe(playing);
    expect(scenarioPlayKey({ ...plain, given: { holder: { game: "old_keep" } } })).not.toBe(playing);
    expect(scenarioPlayKey({ ...plain, given: { holder: { passed: ["starfall"] } } })).not.toBe(key);
    expect(scenarioPlayKey({ ...plain, given: { holder: { passed: [] } } })).toBe(key);
    expect(scenarioPlayKey({ ...plain, given: { rival: { lastRoll: 4 } } })).not.toBe(key);
    expect(scenarioPlayKey({ ...plain, steps: [{ do: "use", pick: { genre: "horror" } }] })).not.toBe(key);
    expect(scenarioPlayKey({ ...plain, steps: [{ do: "use", pick: { genre: "rpg" } }] })).not.toBe(
      scenarioPlayKey({ ...plain, steps: [{ do: "use", pick: { genre: "horror" } }] }),
    );
    expect(scenarioPlayKey({ ...plain, steps: [{ do: "use", take: "gear_run" }] })).not.toBe(key);
  });
});

describe("objects in a scenario (wave D, spec §6.18)", () => {
  const base: ScenarioDoc = { title: { ru: "Мина" }, steps: [{ do: "roll", outcome: "passed", dice: 4 }] };

  it("checks how many objects stand on the board after the step", () => {
    const step: ScenarioStep = { do: "use", pick: { cell: 14 }, expect: { objects: 1 } };
    expect(compareStep(step, seen({ objects: 1 }), idOf, slugOf)).toEqual([{ field: "objects", expected: 1, actual: 1, ok: true }]);
    expect(compareStep(step, seen({ objects: 0 }), idOf, slugOf)[0]).toMatchObject({ ok: false, actual: 0 });
  });

  it("the objects given and the cell a use picks key the play — none given keys as before, the holder's spelled out", () => {
    const key = scenarioPlayKey(base);
    expect(scenarioPlayKey({ ...base, given: { objects: [] } })).toBe(key);
    const mine: ScenarioDoc = { ...base, given: { objects: [{ entry: "self", cell: 12 }] } };
    expect(scenarioPlayKey(mine)).not.toBe(key);
    expect(scenarioPlayKey({ ...base, given: { objects: [{ entry: "self", cell: 12, owner: "holder" }] } })).toBe(scenarioPlayKey(mine));
    expect(scenarioPlayKey({ ...base, given: { objects: [{ entry: "self", cell: 12, owner: "rival" }] } })).not.toBe(scenarioPlayKey(mine));
    expect(scenarioPlayKey({ ...base, given: { objects: [{ entry: "self", cell: 13 }] } })).not.toBe(scenarioPlayKey(mine));
    const use: ScenarioDoc = { ...base, steps: [{ do: "use", pick: { cell: 14 } }] };
    expect(scenarioPlayKey({ ...use, steps: [{ do: "use", pick: { cell: 15 } }] })).not.toBe(scenarioPlayKey(use));
  });
});

