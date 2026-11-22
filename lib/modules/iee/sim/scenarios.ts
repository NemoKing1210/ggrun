/**
 * Entry scenarios (docs/IEE_CONSTRUCTOR_SPEC.md §5.5): what an entry promises,
 * written as data — Given / When / Then — and run in a memory season.
 *
 * Publishing and importing run every scenario of every entry they let
 * through, and a red one keeps the entry a draft. The season is fixed and
 * small so a scenario reads the same everywhere: a 40-cell board without a
 * loop (a scenario may make it loop); one d6 on a pass and two on a drop (the
 * sides may be set); no streak
 * multiplier; points never ride on a roll; other players may be targeted and
 * nobody is protected; the wheel never hands anything out — whether it would
 * spin is something a step may check. The holder starts on cell 10 with 5
 * points and four rolls behind them, the rival on cell 12 with 5 points and
 * nine moves. The next game is drawn from the scenario pool (wave C): eight
 * fixed games, in their order.
 *
 * The entry under test plays its own document; every other entry it names —
 * in its rules or in its scenarios — plays the document `docOf` hands over:
 * its latest revision, or a draft published together with it.
 */
import { DEFAULT_SEASON_CONFIG, type Polarity, type SeasonConfig } from "@/lib/engine";
import {
  compareStep,
  compileSet,
  type EntryDoc,
  type Issue,
  type Localized,
  SCENARIO_GAMES,
  scenarioGame,
  type ScenarioCheck,
  type ScenarioDoc,
  type ScenarioEntry,
  type ScenarioGiven,
  type ScenarioPick,
  type ScenarioStep,
  type ScenarioValue,
  type SetMemberInput,
  type StepObservation,
} from "@/lib/engine/iee/dsl";
import type { PickRequest } from "@/lib/engine";

import { buildRegistry, type SeasonRegistry } from "../registry";
import { mentionedEntries, referencedEntries, scenarioEntries } from "../library/refs";
import { SimError, simSeason, type SimSeason } from "./season";

// What a step observes and how it is compared live in the engine, where the editor can reach them.
export type { ScenarioCheck, ScenarioField, ScenarioValue, StepObservation } from "@/lib/engine/iee/dsl";

export const SCENARIO_HOLDER = "holder";
export const SCENARIO_RIVAL = "rival";

/** The roll both players have behind them when a scenario starts. */
const START_ROLL = 4;

/** A game of the scenario pool by its key, as the season knows it: its id. */
const gameId = (key: string): string => scenarioGame(key)?.id ?? key;

/** What a side starts with on the game's side (wave C): the game in flight, the games passed. */
function gamesGiven(side: NonNullable<ScenarioGiven["holder"]>) {
  return {
    inFlight: (side.inFlight ?? false) || side.game !== undefined,
    game: side.game ? gameId(side.game) : null,
    passed: (side.passed ?? []).map(gameId),
  };
}

/** A use's pick for the next game, as the dashboard sends it (§6.16): a game of the pool by its id. */
function pickOf(pick: ScenarioPick): PickRequest {
  if ("game" in pick) return { gameId: gameId(pick.game) };
  if ("genre" in pick) return { genre: pick.genre };
  if ("cell" in pick) return { cell: pick.cell };
  return { years: [pick.years[0], pick.years[1]] };
}

export interface ScenarioStepReport {
  index: number;
  ok: boolean;
  /** The step could not run at all. */
  broken?: { reason: "dice_impossible" | "not_in_run" | "compile" | "missing_entry" | "object_cell"; params: Record<string, string> };
  checks: ScenarioCheck[];
  observed: StepObservation | null;
}

export interface ScenarioReport {
  index: number;
  id: string | null;
  title: Localized;
  ok: boolean;
  /** Up to the first step that could not run. */
  steps: ScenarioStepReport[];
}

export interface ScenarioRun {
  ok: boolean;
  reports: ScenarioReport[];
}

export interface ScenarioSubject {
  entryId: string;
  doc: EntryDoc;
  /** Another entry's document — its latest revision, or a draft published with it; null when it has none. */
  docOf: (entryId: string) => EntryDoc | null;
}

/** The season every scenario plays in (see the file comment). */
export function scenarioSeasonConfig(sides = 6, loop = false): SeasonConfig {
  return {
    ...DEFAULT_SEASON_CONFIG,
    dice: { sides, passDiceCount: 1, dropDiceCount: 2, dropStreakMultiplier: false },
    points: { startingBalance: 0, bonusAddsToRollOnPass: false, resetBalanceAfterUse: false },
    board: { ...DEFAULT_SEASON_CONFIG.board, size: 40, loop },
    iee: {
      ...DEFAULT_SEASON_CONFIG.iee,
      enabled: true,
      allowTargetingOthers: true,
      pvpProtectionMoves: 0,
      revealDropsInFeed: false,
      nothingWeight: 0,
    },
  };
}

/** The entry under test, and everything it names, compiled together. */
function subjectRegistry(subject: ScenarioSubject): SeasonRegistry {
  const members = new Map<string, SetMemberInput>();
  members.set(subject.entryId, { entryId: subject.entryId, revisionId: `sim:${subject.entryId}`, doc: subject.doc });
  const queue = mentionedEntries(subject.doc);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (members.has(id)) continue;
    const doc = subject.docOf(id);
    if (!doc) continue;
    members.set(id, { entryId: id, revisionId: `sim:${id}`, doc });
    queue.push(...referencedEntries(doc));
  }
  return buildRegistry(compileSet([...members.values()]));
}

class DiceImpossible extends Error {
  constructor(
    readonly total: number,
    readonly count: number,
    readonly sides: number,
  ) {
    super(`${count}d${sides} cannot show ${total}`);
  }
}

/**
 * Dice that show `total` between them, as evenly as the faces allow — and,
 * after that first throw, the faces `then` lists, in order: the dice thrown
 * again and a second throw (spec §7.2). The last face drawn repeats.
 */
function showing(total: number, then: readonly number[] = []) {
  return (dice: { count: number; sides: number }) => {
    const { count, sides } = dice;
    const possible = count === 0 ? total === 0 : total >= count && total <= count * sides;
    if (!possible) throw new DiceImpossible(total, count, sides);
    const impossible = then.find((face) => face > sides);
    if (impossible !== undefined) throw new DiceImpossible(impossible, 1, sides);
    const base = count === 0 ? 0 : Math.floor(total / count);
    const extra = count === 0 ? 0 : total % count;
    const faces = [...Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0)), ...then];
    let next = 0;
    // `rollDice` turns r into floor(r · sides) + 1: the middle of a face's slice.
    return () => ((faces[Math.min(next++, faces.length - 1)] ?? 1) - 0.5) / sides;
  };
}

const WHEEL_NAME: Record<Polarity, "bonus" | "penalty"> = { positive: "bonus", negative: "penalty" };

async function countsOf(season: SimSeason, player: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const row of await season.holdings(player)) out[row.entryId] = (out[row.entryId] ?? 0) + 1;
  return out;
}

/** Runs one scenario of `subject` over `registry`. */
async function runOne(subject: ScenarioSubject, registry: SeasonRegistry, scenario: ScenarioDoc, index: number): Promise<ScenarioReport> {
  const report: ScenarioReport = { index, id: scenario.id ?? null, title: scenario.title, ok: true, steps: [] };
  const fail = (step: ScenarioStepReport) => {
    report.steps.push(step);
    report.ok = false;
  };

  if (!registry.set.byEntryId.has(subject.entryId)) {
    const why = registry.set.failures.find((f) => f.entryId === subject.entryId)?.errors[0]?.message ?? "does not compile";
    fail({ index: 0, ok: false, broken: { reason: "compile", params: { message: why } }, checks: [], observed: null });
    return report;
  }

  // Every entry the scenario names must be in its season: a grant of nothing
  // would quietly set up less than the scenario says.
  const absent = scenarioEntries({ scenarios: [scenario] }).find((id) => id !== subject.entryId && !registry.get(id));
  if (absent) {
    fail({ index: 0, ok: false, broken: { reason: "missing_entry", params: { entry: absent } }, checks: [], observed: null });
    return report;
  }

  const given = scenario.given ?? {};
  const draws = given.draws === "high" ? () => 0.999_999 : () => 0;
  const season = simSeason({
    seasonId: `scenario:${subject.entryId}:${index}`,
    registry,
    config: scenarioSeasonConfig(given.sides, given.loop),
    players: [
      {
        id: SCENARIO_HOLDER,
        position: given.holder?.position ?? 10,
        balance: given.holder?.balance ?? 5,
        rollSeq: START_ROLL,
        moveCount: START_ROLL,
        lastRoll: given.holder?.lastRoll ?? null,
        ...gamesGiven(given.holder ?? {}),
      },
      {
        id: SCENARIO_RIVAL,
        position: given.rival?.position ?? 12,
        balance: given.rival?.balance ?? 5,
        rollSeq: START_ROLL,
        moveCount: 9,
        lastRoll: given.rival?.lastRoll ?? null,
        status: given.rival?.left ? "withdrawn" : "active",
        ...gamesGiven(given.rival ?? {}),
      },
    ],
    cellAt: (position) => ({ position, cellType: "normal", config: {} }),
    rng: draws,
    games: SCENARIO_GAMES,
  });

  const idOf = (entry: ScenarioEntry) => (entry === "self" ? subject.entryId : entry.entry);
  const slugOf = (id: string) => registry.get(id)?.slug ?? id;

  // Given: in force before the first step, as if handed out at the end of the last roll.
  for (const side of [SCENARIO_HOLDER, SCENARIO_RIVAL] as const) {
    for (const carried of given[side]?.carries ?? []) {
      for (let i = 0; i < (carried.count ?? 1); i++) {
        await season.give(idOf(carried.entry), side, {
          source: "scenario",
          anchor: { anchorRollSeq: START_ROLL },
        });
      }
    }
  }

  // Objects standing on the board (wave D, §6.18): the holder's, unless the scenario names the rival.
  for (const object of given.objects ?? []) {
    const owner = object.owner === "rival" ? SCENARIO_RIVAL : SCENARIO_HOLDER;
    if (!(await season.place(idOf(object.entry), owner, object.cell))) {
      fail({ index: 0, ok: false, broken: { reason: "object_cell", params: { cell: String(object.cell) } }, checks: [], observed: null });
      return report;
    }
  }

  for (const [n, step] of scenario.steps.entries()) {
    const before = { holder: season.balance(SCENARIO_HOLDER), rival: season.balance(SCENARIO_RIVAL) };
    let observed: Omit<StepObservation, "balance" | "rivalBalance" | "position" | "rivalPosition" | "holder" | "rival">;
    try {
      observed = await runStep(season, subject, step, idOf);
    } catch (e) {
      if (e instanceof DiceImpossible) {
        fail({
          index: n,
          ok: false,
          broken: { reason: "dice_impossible", params: { total: String(e.total), count: String(e.count), sides: String(e.sides) } },
          checks: [],
          observed: null,
        });
        return report;
      }
      if (e instanceof SimError) {
        fail({ index: n, ok: false, broken: { reason: "not_in_run", params: { who: e.player } }, checks: [], observed: null });
        return report;
      }
      throw e;
    }
    const full: StepObservation = {
      ...observed,
      balance: season.balance(SCENARIO_HOLDER) - before.holder,
      rivalBalance: season.balance(SCENARIO_RIVAL) - before.rival,
      position: season.player(SCENARIO_HOLDER).position,
      rivalPosition: season.player(SCENARIO_RIVAL).position,
      holder: await countsOf(season, SCENARIO_HOLDER),
      rival: await countsOf(season, SCENARIO_RIVAL),
      decision: (await season.pendingChoice(SCENARIO_HOLDER)) ? "pending" : "none",
      game: holderGame(season),
      offered: await season.offered(SCENARIO_HOLDER),
      conditions: (await season.conditions(SCENARIO_HOLDER)).length,
      objects: (await season.objects()).length,
    };
    const checks = compareStep(step, full, idOf, slugOf);
    const ok = checks.every((c) => c.ok);
    if (ok) report.steps.push({ index: n, ok, checks, observed: full });
    else fail({ index: n, ok, checks, observed: full });
  }
  return report;
}

/** The holder's game in flight, by its key in the scenario pool; "none" without one. */
function holderGame(season: SimSeason): string {
  const id = season.player(SCENARIO_HOLDER).game;
  return id ? (scenarioGame(id)?.key ?? id) : "none";
}

async function runStep(
  season: SimSeason,
  subject: ScenarioSubject,
  step: ScenarioStep,
  idOf: (entry: ScenarioEntry) => string,
): Promise<Omit<StepObservation, "balance" | "rivalBalance" | "position" | "rivalPosition" | "holder" | "rival">> {
  switch (step.do) {
    case "roll": {
      // In the reaction window (§7.4): the roller's newest of the item the step names, if it is offered.
      const reactWith = step.react ? idOf(step.react) : null;
      const roller = step.by ?? SCENARIO_HOLDER;
      const newest = reactWith ? (await season.holdings(roller)).filter((r) => r.entryId === reactWith).map((r) => r.id) : [];
      const turn = await season.turn({
        player: roller,
        outcome: step.outcome,
        dice: showing(step.dice, step.then),
        // The move ends on the cell the step names, wherever that is.
        cellAt: (position) => ({ position, cellType: step.cell ?? "normal", config: {} }),
        spin: false,
        react: ({ offers }) => newest.find((id) => offers.some((o) => o.instanceId === id)) ?? null,
      });
      return {
        moved: turn.played.movedTo - turn.from,
        diceCount: turn.played.dice.count,
        diceSides: turn.played.dice.sides,
        cellFires: turn.played.landed !== null && !turn.played.cellAbsorbed,
        wheel: turn.played.wheel ? WHEEL_NAME[turn.played.wheel] : "none",
        wheelAgain: turn.played.extraWheels[0] ? WHEEL_NAME[turn.played.extraWheels[0]] : "none",
        window: turn.window,
      };
    }
    case "use": {
      const itemId = step.item?.entry ?? subject.entryId;
      const aim = season.registry.item(itemId)?.usage.target;
      // Who uses it (wave B: the rival too); an aimed item goes to the other player unless the step says.
      const user = step.by ?? SCENARIO_HOLDER;
      const other = user === SCENARIO_HOLDER ? SCENARIO_RIVAL : SCENARIO_HOLDER;
      const on = step.on ?? (aim === "other" || aim === "any" ? other : "nobody");
      // The pick: the user's newest instance of the entry the step names.
      const chosen = step.choose ? idOf(step.choose) : null;
      const choice = chosen ? ((await season.holdings(user)).find((r) => r.entryId === chosen)?.id ?? null) : null;
      const used = await season.use({
        player: user,
        item: { entry: itemId },
        target: on === "rival" ? SCENARIO_RIVAL : on === "holder" ? SCENARIO_HOLDER : null,
        choice,
        // A pick from the season's catalog (§6.12): the entry the step names.
        entryChoice: step.chooseEntry ? idOf(step.chooseEntry) : null,
        // A pick for the next game, and the game taken from a choice it opens (wave C, §6.16, §7.12).
        pick: step.pick ? pickOf(step.pick) : null,
        take: step.take ? gameId(step.take) : null,
      });
      return { result: used.ok ? "used" : "refused", reason: used.code };
    }
    case "grant": {
      // As staff hand out — or, `via: "wheel"`, as a drop the recipient's entries may answer (§6.13).
      const id = idOf(step.entry);
      const wheel = step.via === "wheel" ? (season.registry.get(id)?.character === "penalty" ? "cell_penalty" : "cell_bonus") : null;
      const granted = await season.give(id, step.to ?? SCENARIO_HOLDER, {
        source: wheel ?? "scenario",
        ...(wheel ? { arrival: { from: null } } : {}),
      });
      const result = granted.state === "granted" ? "granted" : granted.state === "refreshed" ? "refreshed" : "refused";
      return { result };
    }
    case "decide": {
      // As the dashboard answers (§7.6): the option named and its picks — the newest held of each entry — or the default.
      const who = step.by ?? SCENARIO_HOLDER;
      const held = await season.holdings(who);
      const picks: string[] = [];
      for (const entry of step.picks ?? []) {
        const id = idOf(entry);
        const row = held.find((r) => r.entryId === id && !picks.includes(r.id));
        if (row) picks.push(row.id);
      }
      const decided = await season.decide({
        player: who,
        choice: step.option ? { option: step.option, ...(step.picks ? { picks } : {}) } : null,
      });
      return { result: decided.ok ? "decided" : "refused", reason: decided.code };
    }
    case "draw": {
      // As rolling picks the next game (§7.12): the game in flight, or a choice — taken when the step names a game.
      const drawn = await season.draw({ player: step.by ?? SCENARIO_HOLDER, take: step.take ? gameId(step.take) : null });
      return { result: drawn.result, reason: drawn.code };
    }
  }
}

/** Runs every scenario of an entry. An entry without scenarios is green. */
export async function runEntryScenarios(subject: ScenarioSubject): Promise<ScenarioRun> {
  const scenarios = subject.doc.scenarios ?? [];
  if (scenarios.length === 0) return { ok: true, reports: [] };
  const registry = subjectRegistry(subject);
  const reports: ScenarioReport[] = [];
  for (const [i, scenario] of scenarios.entries()) reports.push(await runOne(subject, registry, scenario, i));
  return { ok: reports.every((r) => r.ok), reports };
}

const show = (value: ScenarioValue) => (value === null ? "nothing" : String(value));

/**
 * A run's red scenarios as publish findings (§14): the first step that went
 * wrong in each, every expectation it missed — `scenario_failed` — or why it
 * could not run — `scenario_broken`. Each points at its step.
 */
export function scenarioIssues(run: ScenarioRun): Issue[] {
  const issues: Issue[] = [];
  for (const report of run.reports) {
    if (report.ok) continue;
    const step = report.steps.find((s) => !s.ok);
    if (!step) continue;
    const at = { scenario: String(report.index + 1), title: report.title.ru, step: String(step.index + 1) };
    const path: (string | number)[] = ["scenarios", report.index, "steps", step.index];
    if (step.broken) {
      issues.push({
        code: "scenario_broken",
        path,
        message: `scenario ${at.scenario} «${at.title}», step ${at.step} cannot run: ${step.broken.reason}`,
        params: { ...at, reason: step.broken.reason, ...step.broken.params },
      });
      continue;
    }
    for (const check of step.checks.filter((c) => !c.ok)) {
      const what = check.entry ? `${check.field} ${check.entry.slug}` : check.field;
      issues.push({
        code: "scenario_failed",
        path: [...path, "expect", check.field],
        message: `scenario ${at.scenario} «${at.title}», step ${at.step}: expected ${what} ${show(check.expected)}, got ${show(check.actual)}`,
        params: {
          ...at,
          field: check.field,
          expected: show(check.expected),
          actual: show(check.actual),
          ...(check.entry ? { entry: check.entry.slug } : {}),
        },
      });
    }
  }
  return issues;
}
