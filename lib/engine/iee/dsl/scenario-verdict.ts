/**
 * What a scenario step did, and how that compares with what it promised
 * (spec §5.5).
 *
 * The run (`lib/modules/iee/sim`) plays a scenario and records what each step
 * did; the comparison is pure and lives here, so the editor can re-check an
 * expectation the author just changed against the last run without playing
 * again — an expectation never changes what happens. `scenarioPlayKey` says
 * when a last run still describes a scenario: equal keys play the same.
 */
import { canonicalJson } from "./canonical";
import type { ScenarioDoc, ScenarioEntry, ScenarioStep } from "./doc";

/** What a step may check — the `expect` fields; `holder` / `rival` count one entry each. */
export type ScenarioField =
  | "moved"
  | "diceCount"
  | "diceSides"
  | "cellFires"
  | "wheel"
  | "wheelAgain"
  | "window"
  | "result"
  | "reason"
  | "balance"
  | "rivalBalance"
  | "position"
  | "rivalPosition"
  | "decision"
  | "game"
  | "offered"
  | "conditions"
  | "objects"
  | "holder"
  | "rival";

export type ScenarioValue = number | boolean | string | null;

export interface ScenarioCheck {
  field: ScenarioField;
  /** For `holder` / `rival`: the entry counted, by id, and its slug. */
  entry?: { id: string; slug: string };
  expected: ScenarioValue;
  actual: ScenarioValue;
  ok: boolean;
}

/** What a step did, whatever it was asked to check — the editor shows it beside the expectations. */
export interface StepObservation {
  moved?: number;
  diceCount?: number;
  diceSides?: number;
  cellFires?: boolean;
  wheel?: "none" | "bonus" | "penalty";
  /** The first wheel a rule spun once more (spec §6.12); none when no rule asked. */
  wheelAgain?: "none" | "bonus" | "penalty";
  /** Whether a reaction window opened on the roll, and how it was answered (wave B, §7.4). */
  window?: "none" | "accepted" | "used";
  result?: string;
  reason?: string | null;
  /** Points won or lost in the step. */
  balance: number;
  rivalBalance: number;
  /** Where each stands after the step. */
  position: number;
  rivalPosition: number;
  /** Active instances by entry id after the step. */
  holder: Record<string, number>;
  rival: Record<string, number>;
  /** Whether a victim choice waits for the holder after the step (wave B, §7.6). */
  decision?: "pending" | "none";
  /** The holder's game in flight after the step, of the scenario pool, or "none" (wave C, §7.12). */
  game?: string;
  /** How many games the holder's pending choice offers after the step; 0 for none (wave C). */
  offered?: number;
  /** How many completion conditions the holder's game in flight holds after the step; 0 for none (wave C, §6.17). */
  conditions?: number;
  /** How many objects stand on the board after the step; 0 for none (wave D, §6.18). */
  objects?: number;
}

/** The fields compared as they are, in the order checks are listed. */
const PLAIN = [
  "moved",
  "diceCount",
  "diceSides",
  "cellFires",
  "wheel",
  "wheelAgain",
  "window",
  "result",
  "reason",
  "balance",
  "rivalBalance",
  "position",
  "rivalPosition",
  "decision",
  "game",
  "offered",
  "conditions",
  "objects",
] as const;

/**
 * Each expectation of a step against what it did. `idOf` resolves an entry the
 * scenario names to its id (`"self"` is the entry under test); `slugOf` names
 * it in the check.
 */
export function compareStep(
  step: ScenarioStep,
  seen: StepObservation,
  idOf: (entry: ScenarioEntry) => string,
  slugOf: (id: string) => string,
): ScenarioCheck[] {
  const expect = (step.expect ?? {}) as Record<string, unknown>;
  const checks: ScenarioCheck[] = [];
  for (const field of PLAIN) {
    if (expect[field] === undefined) continue;
    const expected = expect[field] as ScenarioValue;
    const actual = (seen[field] ?? null) as ScenarioValue;
    checks.push({ field, expected, actual, ok: expected === actual });
  }
  for (const side of ["holder", "rival"] as const) {
    for (const h of step.expect?.[side] ?? []) {
      const id = idOf(h.entry);
      const actual = seen[side][id] ?? 0;
      checks.push({ field: side, entry: { id, slug: slugOf(id) }, expected: h.count, actual, ok: actual === h.count });
    }
  }
  return checks;
}

/** A step without its expectations, its defaults spelled out: what it does. */
function playOf(step: ScenarioStep): Record<string, unknown> {
  switch (step.do) {
    case "roll":
      return {
        do: "roll",
        by: step.by ?? "holder",
        outcome: step.outcome,
        dice: step.dice,
        then: step.then ?? [],
        cell: step.cell ?? "normal",
        // A reaction plays differently; a step that uses none keys as it always did.
        ...(step.react !== undefined ? { react: step.react === "self" ? "self" : step.react.entry } : {}),
      };
    case "use":
      return {
        do: "use",
        item: step.item?.entry ?? "self",
        on: step.on ?? null,
        // Who uses it plays differently; a step without one keys as it always did.
        ...(step.by !== undefined ? { by: step.by } : {}),
        // What it picks plays differently too; a step that picks nothing keys as it always did.
        ...(step.choose !== undefined ? { choose: step.choose === "self" ? "self" : step.choose.entry } : {}),
        ...(step.chooseEntry !== undefined ? { chooseEntry: step.chooseEntry === "self" ? "self" : step.chooseEntry.entry } : {}),
        // A pick for the next game and a game taken play differently (wave C); without them, as always.
        ...(step.pick !== undefined ? { pick: step.pick } : {}),
        ...(step.take !== undefined ? { take: step.take } : {}),
      };
    case "grant":
      return {
        do: "grant",
        entry: step.entry === "self" ? "self" : step.entry.entry,
        to: step.to ?? "holder",
        ...(step.via !== undefined ? { via: step.via } : {}),
      };
    case "decide":
      return {
        do: "decide",
        by: step.by ?? "holder",
        option: step.option ?? null,
        picks: (step.picks ?? []).map((p) => (p === "self" ? "self" : p.entry)),
      };
    case "draw":
      return { do: "draw", by: step.by ?? "holder", take: step.take ?? null };
  }
}

const entryKey = (entry: ScenarioEntry) => (entry === "self" ? "self" : entry.entry);

/**
 * What plays in a scenario, as a string: its given and its steps, without the
 * expectations, the title or the note, the season's defaults spelled out. A
 * run of a scenario describes every scenario with the same key.
 */
export function scenarioPlayKey(scenario: ScenarioDoc): string {
  const given = scenario.given ?? {};
  const side = (who: "holder" | "rival") => {
    const g = given[who] ?? {};
    return {
      position: g.position ?? (who === "holder" ? 10 : 12),
      balance: g.balance ?? 5,
      inFlight: g.inFlight === true || g.game !== undefined,
      left: who === "rival" && given.rival?.left === true,
      carries: (g.carries ?? []).map((c) => [entryKey(c.entry), c.count ?? 1]),
      // The last roll plays differently («Магнит»); without one, as always.
      ...(g.lastRoll !== undefined ? { lastRoll: g.lastRoll } : {}),
      // The scenario pool's games (wave C) play differently; without them, as always.
      ...(g.game !== undefined ? { game: g.game } : {}),
      ...(g.passed !== undefined && g.passed.length > 0 ? { passed: g.passed } : {}),
    };
  };
  return canonicalJson({
    holder: side("holder"),
    rival: side("rival"),
    sides: given.sides ?? 6,
    loop: given.loop === true,
    draws: given.draws ?? "low",
    // Objects on the board play differently (wave D, §6.18); without them, as always.
    ...(given.objects !== undefined && given.objects.length > 0
      ? { objects: given.objects.map((o) => [entryKey(o.entry), o.cell, o.owner ?? "holder"]) }
      : {}),
    steps: scenario.steps.map(playOf),
  });
}
