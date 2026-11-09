/**
 * Entry scenarios in the editor (spec §5.5): pure functions the scenarios
 * block calls to build Given / When / Then without breaking the document's
 * shape. Client-safe, like `./draft`.
 */
import {
  CELL_TYPES,
  DRAW_REFUSALS,
  SCENARIO_GAME_KEYS,
  SCENARIO_ID_RE,
  ScenarioPickSchema,
  USE_REFUSALS,
  canonicalJson,
  compareStep,
  DECIDE_OPTIONS,
  scenarioPlayKey,
  type DecideStep,
  type DrawStep,
  type ScenarioGame,
  type EntryDoc,
  type GrantStep,
  type Localized,
  type RollStep,
  type ScenarioCheck,
  type ScenarioDoc,
  type ScenarioEntry,
  type ScenarioGiven,
  type ScenarioHolding,
  type ScenarioStep,
  type StepObservation,
  type UseStep,
} from "@/lib/engine/iee/dsl";
import type { ScenarioReport, ScenarioRun, ScenarioStepReport } from "@/lib/modules/iee/sim/scenarios";

export type StepKind = ScenarioStep["do"];
export const STEP_KINDS: readonly StepKind[] = ["roll", "use", "grant", "decide", "draw"];

/** What a step may check afterwards, by kind, in the order the editor offers them. */
export const STEP_CHECKS = {
  roll: [
    "moved",
    "diceSides",
    "diceCount",
    "cellFires",
    "wheel",
    "wheelAgain",
    "window",
    "balance",
    "rivalBalance",
    "position",
    "rivalPosition",
    "decision",
    "game",
    "offered",
    "conditions",
    "objects",
    "holder",
    "rival",
  ],
  use: ["result", "reason", "balance", "rivalBalance", "position", "rivalPosition", "decision", "game", "offered", "conditions", "objects", "holder", "rival"],
  grant: ["result", "balance", "rivalBalance", "position", "rivalPosition", "decision", "game", "offered", "conditions", "objects", "holder", "rival"],
  decide: ["result", "balance", "rivalBalance", "position", "rivalPosition", "decision", "game", "offered", "conditions", "objects", "holder", "rival"],
  // The next game picked, as rolling picks it (wave C, spec §7.12) — and the completion conditions it gets (§6.17).
  draw: ["result", "reason", "game", "offered", "conditions", "objects", "balance", "rivalBalance", "position", "rivalPosition", "decision", "holder", "rival"],
} as const satisfies Record<StepKind, readonly string[]>;
export type CheckField = (typeof STEP_CHECKS)[StepKind][number];

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const intOr = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) ? v : fallback);

function localizedOf(value: unknown): Localized {
  const r = isRecord(value) ? value : {};
  const out: Localized = { ru: typeof r.ru === "string" ? r.ru : "" };
  if (typeof r.en === "string") out.en = r.en;
  if (typeof r.uk === "string") out.uk = r.uk;
  return out;
}

const isGame = (v: unknown): v is ScenarioGame => (SCENARIO_GAME_KEYS as readonly unknown[]).includes(v);

function entryOf(value: unknown): ScenarioEntry {
  if (value === "self") return "self";
  if (isRecord(value) && typeof value.entry === "string") {
    return typeof value.slug === "string" ? { entry: value.entry, slug: value.slug } : { entry: value.entry };
  }
  return "self";
}

/**
 * A stored step as the editor holds it: the right kind, the fields it needs.
 * Expectations stay as they are — the checks say what is wrong with them.
 */
function stepOf(raw: Record<string, unknown>): ScenarioStep | null {
  const expect = isRecord(raw.expect) ? (raw.expect as Record<string, unknown>) : undefined;
  switch (raw.do) {
    case "roll":
      return {
        do: "roll",
        ...(raw.by === "holder" || raw.by === "rival" ? { by: raw.by } : {}),
        outcome: raw.outcome === "dropped" ? "dropped" : "passed",
        dice: intOr(raw.dice, 4),
        ...(Array.isArray(raw.then) && raw.then.length > 0 && raw.then.every((f) => Number.isInteger(f))
          ? { then: raw.then as number[] }
          : {}),
        ...((CELL_TYPES as readonly unknown[]).includes(raw.cell) ? { cell: raw.cell as RollStep["cell"] } : {}),
        // The reaction item the roller uses in the window (wave B, spec §7.4).
        ...(raw.react === "self" || (isRecord(raw.react) && typeof raw.react.entry === "string") ? { react: entryOf(raw.react) } : {}),
        ...(expect ? { expect: expect as RollStep["expect"] } : {}),
      };
    case "use":
      return {
        do: "use",
        ...(isRecord(raw.item) && typeof raw.item.entry === "string" ? { item: entryOf(raw.item) as { entry: string } } : {}),
        ...(raw.by === "holder" || raw.by === "rival" ? { by: raw.by } : {}),
        ...(raw.on === "rival" || raw.on === "holder" || raw.on === "nobody" ? { on: raw.on } : {}),
        ...(raw.choose === "self" || (isRecord(raw.choose) && typeof raw.choose.entry === "string") ? { choose: entryOf(raw.choose) } : {}),
        ...(raw.chooseEntry === "self" || (isRecord(raw.chooseEntry) && typeof raw.chooseEntry.entry === "string")
          ? { chooseEntry: entryOf(raw.chooseEntry) }
          : {}),
        // A pick for the next game and a game taken (wave C, spec §6.16, §7.12) — kept while they are one.
        ...(ScenarioPickSchema.safeParse(raw.pick).success ? { pick: raw.pick as UseStep["pick"] } : {}),
        ...(isGame(raw.take) ? { take: raw.take } : {}),
        ...(expect ? { expect: expect as UseStep["expect"] } : {}),
      };
    case "grant":
      return {
        do: "grant",
        entry: entryOf(raw.entry),
        ...(raw.to === "holder" || raw.to === "rival" ? { to: raw.to } : {}),
        ...(raw.via === "wheel" ? { via: "wheel" as const } : {}),
        ...(expect ? { expect: expect as GrantStep["expect"] } : {}),
      };
    case "decide":
      return {
        do: "decide",
        ...(raw.by === "holder" || raw.by === "rival" ? { by: raw.by } : {}),
        ...((DECIDE_OPTIONS as readonly unknown[]).includes(raw.option) ? { option: raw.option as DecideStep["option"] } : {}),
        ...(Array.isArray(raw.picks) && raw.picks.length > 0 ? { picks: raw.picks.map(entryOf) } : {}),
        ...(expect ? { expect: expect as DecideStep["expect"] } : {}),
      };
    case "draw":
      return {
        do: "draw",
        ...(raw.by === "holder" || raw.by === "rival" ? { by: raw.by } : {}),
        ...(isGame(raw.take) ? { take: raw.take } : {}),
        ...(expect ? { expect: expect as DrawStep["expect"] } : {}),
      };
    default:
      return null;
  }
}

/** A stored scenario as the editor holds it, or null when it is not one. */
export function scenarioOf(raw: unknown): ScenarioDoc | null {
  if (!isRecord(raw)) return null;
  const steps = Array.isArray(raw.steps) ? raw.steps.filter(isRecord).map(stepOf).filter((s): s is ScenarioStep => s !== null) : [];
  const out: ScenarioDoc = { title: localizedOf(raw.title), steps };
  if (typeof raw.id === "string") out.id = raw.id;
  if (isRecord(raw.note)) out.note = localizedOf(raw.note);
  if (isRecord(raw.given)) out.given = raw.given as ScenarioGiven;
  return out;
}

function cleanText(text: Localized | undefined): Localized | undefined {
  if (!text) return undefined;
  const out: Localized = { ru: text.ru.trim() };
  const en = text.en?.trim();
  const uk = text.uk?.trim();
  if (en) out.en = en;
  if (uk) out.uk = uk;
  return out.ru || en || uk ? out : undefined;
}

/** Drops what is empty: the editor's blank rows must not change the document's hash. */
function cleanGiven(given: ScenarioGiven | undefined): ScenarioGiven | undefined {
  if (!given) return undefined;
  const out: ScenarioGiven = {};
  for (const side of ["holder", "rival"] as const) {
    const g = given[side];
    if (!g) continue;
    const player = { ...g };
    // A field the editor cleared (a cell, points, a last roll) is no field at all.
    for (const [key, value] of Object.entries(player)) if (value === undefined) delete (player as Record<string, unknown>)[key];
    if (player.carries && player.carries.length === 0) delete player.carries;
    if (player.passed && player.passed.length === 0) delete player.passed;
    if (player.inFlight === false) delete player.inFlight;
    if ("left" in player && player.left === false) delete (player as { left?: boolean }).left;
    if (Object.keys(player).length > 0) out[side] = player;
  }
  if (given.sides !== undefined) out.sides = given.sides;
  if (given.loop) out.loop = true;
  if (given.draws === "high") out.draws = "high";
  // Objects on the board (wave D, spec §6.18); the holder's unless the rival's.
  if (given.objects && given.objects.length > 0) {
    out.objects = given.objects.map((o) => (o.owner === "rival" ? { entry: o.entry, cell: o.cell, owner: "rival" as const } : { entry: o.entry, cell: o.cell }));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanStep(step: ScenarioStep): ScenarioStep {
  const expect = step.expect ? { ...step.expect } : undefined;
  if (expect) {
    for (const side of ["holder", "rival"] as const) {
      const list = (expect as { holder?: ScenarioHolding[]; rival?: ScenarioHolding[] })[side];
      if (list && list.length === 0) delete (expect as Record<string, unknown>)[side];
    }
  }
  const { expect: _expect, ...rest } = step;
  return expect && Object.keys(expect).length > 0 ? ({ ...rest, expect } as ScenarioStep) : (rest as ScenarioStep);
}

/** A scenario as it is saved: trimmed texts, no empty note, no empty given or checks. */
export function cleanScenario(s: ScenarioDoc): ScenarioDoc {
  const out: ScenarioDoc = { title: cleanText(s.title) ?? { ru: "" }, steps: s.steps.map(cleanStep) };
  const id = s.id?.trim();
  if (id) out.id = id;
  const note = cleanText(s.note);
  if (note) out.note = note;
  const given = cleanGiven(s.given);
  if (given) out.given = given;
  return out;
}

/** A new step of a kind, ready to edit; it checks what that kind most often promises. */
export function defaultStep(doc: EntryDoc, kind: StepKind): ScenarioStep {
  switch (kind) {
    case "roll":
      return { do: "roll", outcome: "passed", dice: 4, expect: { moved: 4 } };
    case "use":
      // An item that stands on the board asks for its cell, and promises it stands there (wave D, §6.18).
      if (doc.kind === "item" && doc.usage?.pick === "cell") return { do: "use", pick: { cell: 14 }, expect: { result: "used", objects: 1 } };
      return doc.kind === "item" ? { do: "use", expect: { result: "used" } } : { do: "use", item: { entry: "" }, expect: { result: "used" } };
    case "grant":
      return { do: "grant", entry: "self", expect: { result: "granted" } };
    // The holder answers what waits for them — the default, unless an option is named.
    case "decide":
      return { do: "decide", expect: { result: "decided" } };
    // The holder's next game is picked (wave C, spec §7.12).
    case "draw":
      return { do: "draw", expect: { result: "drawn" } };
  }
}

/** A new scenario: the entry in force (or in hand) and one step that checks something. */
export function newScenario(doc: EntryDoc): ScenarioDoc {
  return {
    title: { ru: "" },
    given: { holder: { carries: [{ entry: "self" }] } },
    steps: [defaultStep(doc, doc.kind === "item" ? "use" : "roll")],
  };
}

/** A fresh id for a copy: the next free `…-n` after the source's. */
export function nextScenarioId(doc: EntryDoc, base: string | undefined): string | undefined {
  if (!base || !SCENARIO_ID_RE.test(base)) return undefined;
  const taken = new Set((doc.scenarios ?? []).map((s) => s.id));
  const m = /^(.*?)(\d+)$/.exec(base);
  const stem = m ? m[1]! : `${base}-`;
  for (let n = m ? Number(m[2]) + 1 : 2; n < 1000; n++) {
    const id = `${stem}${n}`;
    if (!taken.has(id) && SCENARIO_ID_RE.test(id)) return id;
  }
  return undefined;
}

export function updateScenario(doc: EntryDoc, index: number, change: (s: ScenarioDoc) => ScenarioDoc): EntryDoc {
  const scenarios = [...(doc.scenarios ?? [])];
  const current = scenarios[index];
  if (!current) return doc;
  scenarios[index] = change(current);
  return { ...doc, scenarios };
}

export function updateStep(doc: EntryDoc, index: number, step: number, change: (s: ScenarioStep) => ScenarioStep): EntryDoc {
  return updateScenario(doc, index, (s) => {
    const steps = [...s.steps];
    const current = steps[step];
    if (!current) return s;
    steps[step] = change(current);
    return { ...s, steps };
  });
}

/** Switches a step to another kind, keeping the checks the new kind can make. */
export function withStepKind(doc: EntryDoc, step: ScenarioStep, kind: StepKind): ScenarioStep {
  if (step.do === kind) return step;
  const next = defaultStep(doc, kind);
  const allowed = new Set<string>(STEP_CHECKS[kind]);
  // A result and its reason are the old kind's words («used», «granted»): the new kind starts its own.
  const kept = Object.fromEntries(
    Object.entries(step.expect ?? {}).filter(([field]) => allowed.has(field) && field !== "result" && field !== "reason"),
  );
  return { ...next, expect: { ...(next.expect ?? {}), ...kept } } as ScenarioStep;
}

/** The value a new check starts with. */
export function defaultCheck(field: CheckField, step: ScenarioStep): unknown {
  switch (field) {
    case "moved":
      return step.do === "roll" ? (step.outcome === "passed" ? step.dice : -step.dice) : 0;
    case "diceSides":
      return 6;
    case "diceCount":
      return step.do === "roll" && step.outcome === "dropped" ? 2 : 1;
    case "cellFires":
      return true;
    case "wheel":
    case "wheelAgain":
      return "none";
    // A roll that names a reaction most often promises it is used (wave B, spec §7.4).
    case "window":
      return step.do === "roll" && step.react !== undefined ? "used" : "none";
    case "result":
      return step.do === "grant" ? "granted" : step.do === "decide" ? "decided" : step.do === "draw" ? "drawn" : "used";
    case "reason":
      return step.do === "draw" ? DRAW_REFUSALS[0] : USE_REFUSALS[0];
    // A draw most often promises which game comes up, or how many a choice offers (wave C).
    case "game":
      return step.do === "draw" ? SCENARIO_GAME_KEYS[0] : "none";
    case "offered":
      return step.do === "draw" ? 2 : 0;
    // A draw most often promises the game a condition (§6.17); a reported game holds none.
    case "conditions":
      return step.do === "draw" ? 1 : 0;
    // A use most often promises the object it placed stands (wave D, §6.18); a roll, the one it met is gone.
    case "objects":
      return step.do === "use" ? 1 : 0;
    // A grant of an entry that asks most often promises the question (wave B, spec §7.6).
    case "decision":
      return step.do === "decide" ? "none" : "pending";
    case "balance":
    case "rivalBalance":
      return 0;
    case "position":
      return 10;
    case "rivalPosition":
      return 12;
    case "holder":
    case "rival":
      return [{ entry: "self", count: 1 }];
  }
}

/** Adds a check to a step; a holdings check adds a row to its list. */
export function addCheck(step: ScenarioStep, field: CheckField): ScenarioStep {
  const expect: Record<string, unknown> = { ...(step.expect ?? {}) };
  if (field === "holder" || field === "rival") {
    expect[field] = [...((expect[field] as ScenarioHolding[] | undefined) ?? []), { entry: "self", count: 1 }];
  } else {
    expect[field] = defaultCheck(field, step);
    // A refusal needs a reason only when the use is refused.
    if (field === "reason") expect.result = "refused";
  }
  return { ...step, expect } as ScenarioStep;
}

/** Removes a check — one row of a holdings list, or the whole field. */
export function removeCheck(step: ScenarioStep, field: CheckField, row?: number): ScenarioStep {
  const expect: Record<string, unknown> = { ...(step.expect ?? {}) };
  if ((field === "holder" || field === "rival") && row !== undefined) {
    const list = ((expect[field] as ScenarioHolding[] | undefined) ?? []).filter((_, i) => i !== row);
    if (list.length > 0) expect[field] = list;
    else delete expect[field];
  } else {
    delete expect[field];
  }
  return { ...step, expect } as ScenarioStep;
}

/** Sets a check's value (a whole holdings list for `holder` / `rival`). */
export function setCheck(step: ScenarioStep, field: CheckField, value: unknown): ScenarioStep {
  return { ...step, expect: { ...(step.expect ?? {}), [field]: value } } as ScenarioStep;
}

/** The checks a step makes, in the editor's order. */
export function checksOf(step: ScenarioStep): CheckField[] {
  const present = new Set(Object.keys(step.expect ?? {}));
  return (STEP_CHECKS[step.do] as readonly CheckField[]).filter((f) => present.has(f));
}

// ---------------------------------------------------------------------------
// The last run, against the scenarios as they are now
// ---------------------------------------------------------------------------

/** Fields that only name and draw the entry: changing them changes nothing a scenario plays. */
const COSMETIC = ["name", "flavor", "glyph", "tags", "scenarios"] as const;

/** What the entry plays, as a string: a change to it makes every last verdict stale. */
export function draftPlayKey(doc: EntryDoc): string {
  const rest: Record<string, unknown> = { ...doc };
  for (const key of COSMETIC) delete rest[key];
  return canonicalJson(rest);
}

/** The run the editor holds: each report with the key of what it played. */
export interface EditorScenarioRun {
  /** `draftPlayKey` of the draft it ran. */
  docKey: string;
  reports: (ScenarioReport & { playKey: string })[];
}

/** Keeps a run with the keys of what it played: `draft` is what was sent. */
export function editorRun(draft: EntryDoc, run: ScenarioRun): EditorScenarioRun {
  const scenarios = draft.scenarios ?? [];
  return {
    docKey: draftPlayKey(draft),
    reports: run.reports.map((r) => ({ ...r, playKey: scenarios[r.index] ? scenarioPlayKey(scenarios[r.index]!) : "" })),
  };
}

export type ScenarioStatus = "green" | "red" | "notRun" | "stale";

export interface StepVerdict {
  /** The run reached the step: it ran, or could not. */
  ran: boolean;
  broken?: ScenarioStepReport["broken"];
  /** What it did. */
  observed: StepObservation | null;
  /** Its expectations as they are now, against what it did. */
  checks: ScenarioCheck[];
  ok: boolean;
}

export interface ScenarioVerdict {
  status: ScenarioStatus;
  /** One per step when the last run describes the scenario; empty otherwise. */
  steps: StepVerdict[];
}

/**
 * What the last run says about a scenario as it is now. A run describes it
 * when the entry plays the same and some report played the same Given and
 * When; then each expectation is compared afresh — an expectation never
 * changes what happens, so editing one needs no new run.
 */
export function scenarioVerdict(
  run: EditorScenarioRun | null,
  docKey: string,
  scenario: ScenarioDoc,
  index: number,
  idOf: (entry: ScenarioEntry) => string,
  slugOf: (id: string) => string,
): ScenarioVerdict {
  if (!run) return { status: "notRun", steps: [] };
  if (run.docKey !== docKey) return { status: "stale", steps: [] };
  const key = scenarioPlayKey(scenario);
  const matches = run.reports.filter((r) => r.playKey === key);
  const report = matches.find((r) => r.index === index) ?? matches[0];
  if (!report) return { status: "notRun", steps: [] };
  const steps = scenario.steps.map((step, n): StepVerdict => {
    const seen = report.steps.find((s) => s.index === n);
    if (!seen) return { ran: false, observed: null, checks: [], ok: false };
    if (seen.broken || !seen.observed) return { ran: true, broken: seen.broken, observed: null, checks: [], ok: false };
    const checks = compareStep(step, seen.observed, idOf, slugOf);
    return { ran: true, observed: seen.observed, checks, ok: checks.every((c) => c.ok) };
  });
  return { status: steps.every((s) => s.ok) ? "green" : "red", steps };
}

/**
 * The value a check takes from what a step did — to add a check that holds,
 * or to take what happened. Undefined when what happened is no value the
 * check can hold (a use that went through has no refusal).
 */
export function observedValue(field: CheckField, observed: StepObservation, step: ScenarioStep): unknown {
  switch (field) {
    case "holder":
    case "rival":
      return undefined;
    case "reason":
      return (step.do === "use" || step.do === "draw") && typeof observed.reason === "string" ? observed.reason : undefined;
    default:
      return observed[field];
  }
}

/** Adds a check, starting from what the last run saw when there is one. */
export function addObservedCheck(step: ScenarioStep, field: CheckField, observed: StepObservation | null): ScenarioStep {
  const added = addCheck(step, field);
  if (!observed) return added;
  const value = observedValue(field, observed, step);
  if (value === undefined) return added;
  const next = setCheck(added, field, value);
  // A refusal comes with its reason, and a use or a draw that went through has none.
  if (field === "result" && value !== "refused" && next.expect && "reason" in next.expect) return removeCheck(next, "reason");
  return next;
}

/**
 * Takes what happened for one failed check: the expected value becomes the
 * observed one. For a holdings check, `row` is the line of the list it counts.
 */
export function acceptCheck(step: ScenarioStep, check: ScenarioCheck, row?: number): ScenarioStep {
  if (check.field === "holder" || check.field === "rival") {
    const list = [...((step.expect?.[check.field] as ScenarioHolding[] | undefined) ?? [])];
    const at = row ?? -1;
    if (!list[at] || typeof check.actual !== "number") return step;
    list[at] = { ...list[at]!, count: check.actual };
    return setCheck(step, check.field, list);
  }
  if (check.actual === null) {
    // What the step did has no value of this kind: the check cannot hold — drop it.
    return removeCheck(step, check.field as CheckField);
  }
  const next = setCheck(step, check.field as CheckField, check.actual);
  if (check.field === "result" && check.actual !== "refused") return removeCheck(next, "reason");
  return next;
}
