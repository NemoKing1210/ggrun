/**
 * The sandbox (docs/IEE_CONSTRUCTOR_SPEC.md §10.5): an entry played by bots in
 * a season kept in memory for one request — before it is published, nothing
 * written, nothing to clean up.
 *
 * Every turn is the memory season's (`./season`), so the sandbox plays what a
 * season plays: `playTurn`, the executor, the wheel, the item path; the bots
 * decide with their own policy (`planBotItemUse`, `pickBotOutcome`). The
 * season is a new season's default — its board laid out as a new season lays
 * one, its dice and points — with items and effects on, targeting allowed and
 * no newcomer protection. It attaches the entry under test on its wheel at its
 * rarity's weight, what its rules hand out off the wheels, and, when asked,
 * other entries (`core`'s) on the wheels too. A seed decides the board, the
 * dice, the wheel and the bots, so a run repeats. Each bot's next game is
 * drawn from a pool of its own (wave C): the scenario pool eight times over,
 * enough for every round and the rerolls; a choice is taken at random, as a
 * season's bots take it.
 */
import {
  DEFAULT_SEASON_CONFIG,
  defaultCatalogEntry,
  pickBotOutcome,
  objectCellsFor,
  planBotItemUse,
  type BotItemHold,
  type BotOtherPlayer,
  type CellType,
  type IeeParams,
  type Polarity,
  type SeasonCatalogEntry,
  type SeasonConfig,
  type TurnCell,
  type WheelOutcomeKind,
} from "@/lib/engine";
import { SCENARIO_GAMES, compileSet, type EntryDoc, type SetMemberInput } from "@/lib/engine/iee/dsl";
import { generateBoardCells } from "@/lib/modules/catalog/pool/board-generator";

import { offeredGames, standingFor } from "../executor";
import { referencedEntries } from "../library/refs";
import { buildRegistry, type SeasonRegistry } from "../registry";
import { entryChoiceOptions } from "../use";
import type { JournalRow } from "./memory-store";
import { botReactionPolicy, simSeason, type SimGame, type SimSeason, type SimStatus } from "./season";

export const SANDBOX_LIMITS = { minBots: 2, maxBots: 4, minRounds: 1, maxRounds: 50 } as const;

/** The bots' own defaults (`DEFAULT_BOT_RUN_CONFIG`): how often they reach for an item, and at whom. */
const ITEM_CHANCE = 60;
const STRATEGY = "leader" as const;
/** A round's game: passed 70 %, dropped 30 % (spec §10.5). */
const OUTCOME_WEIGHTS = { passed: 70, dropped: 30, rerolled: 0 };

/**
 * The sandbox's game pool (wave C, spec §6.16): the scenario pool eight times
 * over — the same genres, the years a little later each time round.
 */
export const SANDBOX_GAMES: readonly SimGame[] = Array.from({ length: SCENARIO_GAMES.length * 8 }, (_, i) => {
  const game = SCENARIO_GAMES[i % SCENARIO_GAMES.length]!;
  const lap = Math.floor(i / SCENARIO_GAMES.length);
  return {
    // An id as the catalog's: what a use's pick remembers must read as one.
    id: `5a4db0c0-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    title: lap === 0 ? game.title : `${game.title} ${lap + 1}`,
    genres: game.genres,
    year: game.year + lap,
    rating: game.rating,
  };
});

export interface SandboxOptions {
  /** 2–4 bots. */
  bots: number;
  /** At most 50 rounds; a round is one turn of each bot still in the run. */
  rounds: number;
  /** Decides the board, the dice, the wheel and the bots: the same seed, the same run. */
  seed: number;
  /** Each bot starts with the entry under test — an item in hand, an effect in force. */
  startWith: boolean;
}

export interface SandboxSubject {
  entryId: string;
  /** The entry under test, as it is in the editor. */
  doc: EntryDoc;
  /** Another entry's document — its latest revision; null when it has none. */
  docOf: (entryId: string) => EntryDoc | null;
  /** Entries on the wheels besides it — `core`'s, when the run asks for them. */
  extras?: readonly { entryId: string; doc: EntryDoc }[];
}

/** A journal row of the run (spec §9.2), with its entry named. */
export interface SandboxEvent {
  op: string;
  /** The entry it concerns, by id, and its slug. */
  entryId: string | null;
  key: string | null;
  actor: string | null;
  target: string | null;
  rule: number | null;
  intent: Record<string, unknown>;
  outcome: Record<string, unknown>;
}

export interface SandboxUse {
  /** Before the roll, or with the game in flight. */
  phase: "before_roll" | "in_flight";
  entryId: string | null;
  key: string;
  target: string | null;
  ok: boolean;
  /** Why the item path refused it. */
  code: string | null;
  events: SandboxEvent[];
}

export interface SandboxTurn {
  round: number;
  bot: string;
  /** The game it played, by its title; null when none was left to draw (wave C). */
  game: string | null;
  uses: SandboxUse[];
  /** The game's result; null when the bot left the run before it rolled — an item of its own took it to the finish. */
  outcome: "passed" | "dropped" | null;
  dice: number[];
  sides: number;
  from: number;
  to: number;
  /** The cell the move ended on; null when the move was cancelled. */
  cell: CellType | null;
  /** What the landing's wheel did; null when none spun. */
  wheel: { polarity: Polarity; kind: WheelOutcomeKind; entryId: string | null; key: string | null } | null;
  /** Points after the turn. */
  balance: number;
  finished: boolean;
  events: SandboxEvent[];
}

export interface SandboxEntryStats {
  entryId: string;
  key: string;
  /** Handed out by a wheel. */
  dropped: number;
  /** Handed out otherwise: at the start, by a rule, by an item. */
  granted: number;
  used: number;
  fired: number;
  /** Ran out: a duration over, or an item's last charge spent. */
  expired: number;
  /** Cells its rules added to (or took from) its holders' moves. */
  moved: number;
}

export interface SandboxBot {
  id: string;
  position: number;
  balance: number;
  status: SimStatus;
  /** What it holds at the end, by entry id. */
  holds: Record<string, number>;
}

export interface SandboxRun {
  seed: number;
  bots: number;
  /** Rounds asked for, and rounds played (fewer when every bot finished). */
  rounds: number;
  played: number;
  startWith: boolean;
  /** The board, as the seed laid it out. */
  board: { position: number; cellType: CellType }[];
  /** Grants before the first round. */
  setup: SandboxEvent[];
  turns: SandboxTurn[];
  summary: { bots: SandboxBot[]; entries: SandboxEntryStats[] };
}

export type SandboxOutcome =
  | { ok: true; run: SandboxRun }
  /** The entry does not play with what it names: nothing ran. */
  | { ok: false; reason: "compile"; message: string };

/** A small seeded generator (mulberry32): the run's every draw comes from a seed. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The season the sandbox plays: a new season's defaults, items and effects on. */
export function sandboxSeasonConfig(): SeasonConfig {
  return {
    ...DEFAULT_SEASON_CONFIG,
    iee: {
      ...DEFAULT_SEASON_CONFIG.iee,
      enabled: true,
      allowTargetingOthers: true,
      pvpProtectionMoves: 0,
      revealDropsInFeed: false,
    },
  };
}

export const botId = (n: number) => `bot-${n}`;

/**
 * The season's entries: the one under test, what its rules hand out (and
 * what those hand out), and the extras — one per entry id and per slug, the
 * entry under test first. Only the entry under test and the extras drop from
 * the wheels; the rest play when handed out.
 */
function sandboxRegistry(subject: SandboxSubject): { registry: SeasonRegistry } | { message: string } {
  const members = new Map<string, SetMemberInput>();
  const keys = new Set<string>();
  const add = (entryId: string, doc: EntryDoc) => {
    if (members.has(entryId) || keys.has(doc.slug)) return false;
    members.set(entryId, { entryId, revisionId: `sandbox:${entryId}`, doc });
    keys.add(doc.slug);
    return true;
  };
  add(subject.entryId, subject.doc);
  const queue = referencedEntries(subject.doc);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (members.has(id)) continue;
    const doc = subject.docOf(id);
    if (!doc || !add(id, doc)) continue;
    queue.push(...referencedEntries(doc));
  }
  const onWheels = new Set([subject.entryId]);
  for (const extra of subject.extras ?? []) {
    if (members.has(extra.entryId)) {
      onWheels.add(extra.entryId);
      continue;
    }
    if (!add(extra.entryId, extra.doc)) continue;
    onWheels.add(extra.entryId);
    for (const id of referencedEntries(extra.doc)) {
      const doc = members.has(id) ? null : subject.docOf(id);
      if (doc) add(id, doc);
    }
  }

  const set = compileSet([...members.values()]);
  if (!set.byEntryId.has(subject.entryId)) {
    const failure = set.failures.find((f) => f.entryId === subject.entryId);
    return { message: failure?.errors[0]?.message ?? "does not compile" };
  }
  const rows: SeasonCatalogEntry[] = set.entries.map((e) =>
    defaultCatalogEntry({ entryId: e.entryId, revisionId: e.revisionId, character: e.character, rarity: e.rarity }, { enabled: onWheels.has(e.entryId) }),
  );
  return { registry: buildRegistry(set, rows) };
}

function named(registry: SeasonRegistry, row: JournalRow): SandboxEvent {
  const entry = row.revisionId ? registry.set.byRevisionId.get(row.revisionId) ?? null : null;
  return {
    op: row.op,
    entryId: entry?.entryId ?? null,
    key: entry?.key ?? null,
    actor: row.actorPlayerId ?? null,
    target: row.targetPlayerId ?? null,
    rule: row.ruleIndex ?? null,
    intent: (row.intent ?? {}) as Record<string, unknown>,
    outcome: (row.outcome ?? {}) as Record<string, unknown>,
  };
}

const counts = async (season: SimSeason, id: string): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const row of await season.holdings(id)) out[row.entryId] = (out[row.entryId] ?? 0) + 1;
  return out;
};

/** The bots' item step: their own policy picks, the item path decides. */
async function botItemStep(
  season: SimSeason,
  bots: readonly string[],
  id: string,
  phase: SandboxUse["phase"],
  rng: () => number,
): Promise<SandboxUse | null> {
  if (rng() * 100 >= ITEM_CHANCE) return null;
  const { registry, config } = season;
  const rows = await season.holdings(id);
  const held: BotItemHold[] = rows
    .filter((r) => r.kind === "item" && (r.chargesLeft ?? 0) > 0)
    .map((r) => ({
      inventoryId: r.id,
      itemKey: registry.get(r.revisionId)?.key ?? r.entryId,
      revisionId: r.revisionId,
      params: (r.params ?? {}) as IeeParams,
    }));
  if (held.length === 0) return null;
  const effectsOf = (list: typeof rows) =>
    list.flatMap((r) => {
      const effect = r.kind === "effect" ? registry.effect(r.revisionId) : null;
      return effect ? [effect] : [];
    });
  const others: BotOtherPlayer[] = [];
  for (const other of bots) {
    if (other === id) continue;
    const p = season.player(other);
    const theirs = await season.holdings(other);
    others.push({
      seasonPlayerId: other,
      username: other,
      position: p.position,
      moveCount: p.moveCount,
      status: p.status,
      effects: effectsOf(theirs).map((e) => e.key),
      // What a steal, a trade or a copy may take (spec §6.12).
      bonusItems: theirs.filter((r) => r.kind === "item" && registry.get(r.revisionId)?.character === "bonus").length,
      // Out of reach (wave B, spec §6.13), as the live bots read it.
      untargetable: standingFor(registry, theirs, season.snapshot(other), rng).untargetable,
    });
  }
  // What the pool offers a pick for the next game (wave C, §6.16), and the board a cell (wave D, §6.18): read before planning.
  const offers = {
    genre: await season.pickOptions(id, "genre"),
    years: await season.pickOptions(id, "years"),
    game: await season.pickOptions(id, "game"),
    cell: await season.pickOptions(id, "cell"),
  };
  const freeCells = offers.cell.flatMap((p) => ("cell" in p ? [p.cell] : []));
  const rivals = others.filter((o) => o.status === "active").map((o) => o.position);
  const plan = planBotItemUse(
    {
      actor: season.snapshot(id),
      hasOpenRoll: season.player(id).inFlight,
      held,
      activeEffects: effectsOf(rows).map((e) => ({ effectKey: e.key, polarity: e.polarity })),
      others,
      allowTargetingOthers: config.iee.allowTargetingOthers,
      pvpProtectionMoves: config.iee.pvpProtectionMoves,
      catalog: registry,
      // As the live bots: their own, newest first, for an item that asks for a pick (spec §6.10) …
      choosable: rows.flatMap((r) => {
        const entry = registry.get(r.revisionId);
        return entry && (r.kind === "item" || r.kind === "effect")
          ? [{ instanceId: r.id, kind: r.kind, entryId: entry.entryId, character: entry.character, rarity: entry.rarity }]
          : [];
      }),
      // … and the season's catalog, for one that asks for an item of it (spec §6.12).
      entryOptions: (item) => (item.usage.entryChoice ? entryChoiceOptions(item.usage.entryChoice, registry, item) : []),
      // Kept from its items (wave B), it plans nothing.
      forbidden: standingFor(registry, rows, season.snapshot(id), rng).forbidItems,
      // What the pool offers an item that asks for a pick for the next game (wave C, §6.16);
      // a cell where the object serves the bot (wave D, §6.18).
      picks: (kind, item) =>
        kind === "cell" ? objectCellsFor({ item, free: freeCells, self: season.player(id).position, rivals }) : offers[kind],
    },
    { strategy: STRATEGY, autoCleanse: true, rng },
  );
  if (!plan) return null;
  const used = await season.use({
    player: id,
    item: { instanceId: plan.inventoryId },
    target: plan.targetSeasonPlayerId,
    choice: plan.choiceInstanceId ?? null,
    entryChoice: plan.chosenEntryId ?? null,
    pick: plan.pick ?? null,
  });
  // A game it rerolled or set aside may offer a choice: taken at once (§7.12).
  const taken = used.ok ? await takeOffered(season, id, rng) : [];
  return {
    phase,
    entryId: used.item?.entryId ?? registry.get(plan.itemKey)?.entryId ?? null,
    key: plan.itemKey,
    target: used.target ?? plan.targetSeasonPlayerId,
    ok: used.ok,
    code: used.code,
    events: [...used.journal, ...taken].map((row) => named(registry, row)),
  };
}

/** A choice of games waiting for the bot is taken at once, at random, as a season's bots take it (§7.12). */
async function takeOffered(season: SimSeason, id: string, rng: () => number): Promise<JournalRow[]> {
  const pending = await season.pendingGameChoice(id);
  const offered = pending ? offeredGames(pending) : [];
  if (offered.length === 0) return [];
  const game = offered[Math.min(offered.length - 1, Math.floor(rng() * offered.length))]!;
  return (await season.takeGame({ player: id, gameId: game.gameId })).journal;
}

/**
 * The bot's next game (§7.12): drawn as rolling draws it, a choice taken at
 * once. With nothing left to draw, it plays on without one.
 */
async function drawFor(season: SimSeason, id: string, rng: () => number): Promise<JournalRow[]> {
  const drawn = await season.draw({ player: id });
  if (drawn.result === "refused") {
    season.player(id).inFlight = true;
    return drawn.journal;
  }
  return [...drawn.journal, ...(drawn.result === "choosing" ? await takeOffered(season, id, rng) : [])];
}

/** How often each entry dropped, was handed out, used, fired and ran out, and how far it moved its holders. */
function entryStats(registry: SeasonRegistry, subjectId: string, events: readonly SandboxEvent[]): SandboxEntryStats[] {
  const stats = new Map<string, SandboxEntryStats>();
  const of = (entryId: string, key: string) => {
    let s = stats.get(entryId);
    if (!s) {
      s = { entryId, key, dropped: 0, granted: 0, used: 0, fired: 0, expired: 0, moved: 0 };
      stats.set(entryId, s);
    }
    return s;
  };
  const subject = registry.set.byEntryId.get(subjectId);
  if (subject) of(subject.entryId, subject.key);
  for (const e of events) {
    if (!e.entryId || !e.key) continue;
    const s = of(e.entryId, e.key);
    switch (e.op) {
      case "grant": {
        const source = e.intent.source;
        if (source === "cell_bonus" || source === "cell_penalty") s.dropped += 1;
        else s.granted += 1;
        break;
      }
      case "use":
        s.used += 1;
        if (e.outcome.ended === true) s.expired += 1;
        break;
      case "fire":
        s.fired += 1;
        if (typeof e.outcome.stepsDelta === "number") s.moved += e.outcome.stepsDelta;
        break;
      // An answer to what arrived is a firing of the rule that gave it (wave B, spec §6.13).
      case "block":
      case "reflect":
      case "amplify":
      case "replace":
        s.fired += 1;
        break;
      case "expire":
        s.expired += 1;
        break;
      // A rule that shaped a draw of the next game (wave C, §7.12).
      case "pool":
        s.fired += 1;
        break;
    }
  }
  return [...stats.values()].sort((a, b) => (a.entryId === subjectId ? -1 : b.entryId === subjectId ? 1 : a.key.localeCompare(b.key)));
}

/** Plays the entry under test with bots, round by round. */
export async function runSandbox(subject: SandboxSubject, options: SandboxOptions): Promise<SandboxOutcome> {
  const botCount = Math.min(SANDBOX_LIMITS.maxBots, Math.max(SANDBOX_LIMITS.minBots, Math.trunc(options.bots)));
  const rounds = Math.min(SANDBOX_LIMITS.maxRounds, Math.max(SANDBOX_LIMITS.minRounds, Math.trunc(options.rounds)));
  const seed = Math.trunc(options.seed) >>> 0;

  const built = sandboxRegistry(subject);
  if ("message" in built) return { ok: false, reason: "compile", message: built.message };
  const { registry } = built;

  // Four streams from one seed: a change in what the entry draws leaves the board, the bots' choices and the games drawn alone.
  const boardRng = seededRng(seed ^ 0x0b0a4d00);
  const gameRng = seededRng(seed);
  const botRng = seededRng(seed ^ 0x5eed5eed);
  const poolRng = seededRng(seed ^ 0x9a3e5000);

  const config = sandboxSeasonConfig();
  const cells = generateBoardCells(config, boardRng);
  const cellAt = (position: number): TurnCell | null => {
    const cell = cells[position];
    return cell ? { position: cell.position, cellType: cell.cellType, config: cell.config } : null;
  };
  const bots = Array.from({ length: botCount }, (_, i) => botId(i + 1));
  const season = simSeason({
    seasonId: `sandbox:${subject.entryId}`,
    registry,
    config,
    players: bots.map((id) => ({ id })),
    cellAt,
    rng: gameRng,
    games: SANDBOX_GAMES,
    poolRng,
  });

  const setup: SandboxEvent[] = [];
  if (options.startWith) {
    for (const id of bots) {
      const start = season.store.journal.length;
      await season.give(subject.entryId, id, { source: "sandbox" });
      setup.push(...season.store.journal.slice(start).map((row) => named(registry, row)));
    }
  }

  const turns: SandboxTurn[] = [];
  let played = 0;
  for (let round = 1; round <= rounds; round++) {
    const inRun = bots.filter((id) => season.player(id).status === "active");
    if (inRun.length === 0) break;
    played = round;
    for (const id of inRun) {
      // A move out of turn earlier in the round may have taken it out of the run.
      if (season.player(id).status !== "active") continue;
      const uses: SandboxUse[] = [];
      const start = season.player(id).position;
      // A choice an entry put to it is answered at once, with the default (spec §7.6) — as a season's bots do.
      if (await season.pendingChoice(id)) await season.decide({ player: id, choice: null });
      // A bot reaches for an item before each of its steps, as it does in a season: before it rolls, and with the game in flight.
      const before = await botItemStep(season, bots, id, "before_roll", botRng);
      if (before) uses.push(before);
      const drawn: JournalRow[] = [];
      if (season.player(id).status === "active") {
        drawn.push(...(await drawFor(season, id, botRng)));
        if (await season.pendingChoice(id)) await season.decide({ player: id, choice: null });
        const during = await botItemStep(season, bots, id, "in_flight", botRng);
        if (during) uses.push(during);
      }
      const self = season.player(id);
      const game = self.game ? (season.game(self.game)?.title ?? null) : null;
      if (self.status !== "active") {
        // An item of its own took it to the finish before it rolled («Телепорт», spec §7.3).
        self.inFlight = false;
        turns.push({
          round,
          bot: id,
          game,
          uses,
          outcome: null,
          dice: [],
          sides: config.dice.sides,
          from: start,
          to: self.position,
          cell: null,
          wheel: null,
          balance: season.balance(id),
          finished: self.status === "finished",
          events: drawn.map((row) => named(registry, row)),
        });
        continue;
      }
      const outcome = pickBotOutcome(OUTCOME_WEIGHTS, botRng) === "dropped" ? "dropped" : "passed";
      // A bot answers its reaction window as a live bot does (§7.4).
      const turn = await season.turn({ player: id, outcome, spin: true, react: botReactionPolicy });
      const wheelEntry = turn.wheel?.key ? registry.get(turn.wheel.key) : null;
      turns.push({
        round,
        bot: id,
        game,
        uses,
        outcome,
        dice: turn.played.diceResults,
        sides: turn.played.dice.sides,
        from: turn.from,
        to: turn.played.finalPosition,
        cell: turn.played.landed?.cellType ?? null,
        wheel:
          turn.played.wheel && turn.wheel
            ? { polarity: turn.played.wheel, kind: turn.wheel.kind, entryId: wheelEntry?.entryId ?? null, key: turn.wheel.key }
            : null,
        balance: season.balance(id),
        finished: season.player(id).status === "finished",
        events: [...drawn, ...turn.journal].map((row) => named(registry, row)),
      });
    }
  }

  const all = [...setup, ...turns.flatMap((t) => [...t.uses.flatMap((u) => u.events), ...t.events])];
  const summary = {
    bots: await Promise.all(
      bots.map(async (id) => {
        const p = season.player(id);
        return { id, position: p.position, balance: season.balance(id), status: p.status, holds: await counts(season, id) };
      }),
    ),
    entries: entryStats(registry, subject.entryId, all),
  };
  return {
    ok: true,
    run: {
      seed,
      bots: botCount,
      rounds,
      played,
      startWith: options.startWith,
      board: cells.map((c) => ({ position: c.position, cellType: c.cellType })),
      setup,
      turns,
      summary,
    },
  };
}
