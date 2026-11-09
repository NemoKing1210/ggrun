/**
 * A season that lives in memory for one request — what entry scenarios and
 * the sandbox play in (docs/IEE_CONSTRUCTOR_SPEC.md §5.5, §10.5).
 *
 * Nothing here is a second implementation of the game. A turn is the engine's
 * `playTurn` with the holder's statuses from `hooksOver`, the wheel is
 * `applyWheel`, the end of a turn is `settleTurnHooks`, an item use is
 * `decideItemUse` + `carryOutItemUse`, and every IEE write goes through the
 * executor — the same functions a season's turn and item path call, over an
 * in-memory store instead of a transaction. What this file adds is only what
 * the database would hold: the participants' rows and the order the game
 * writes them in.
 */
import { randomUUID } from "node:crypto";

import {
  chooseReaction,
  playTurn,
  type GameIntent,
  type IeePlayerSnapshot,
  type PickKind,
  type PickRequest,
  type PlayedTurn,
  type PoolCounters,
  type ReactionView,
  type SeasonConfig,
  type TurnCell,
  type UsePick,
  type WheelOutcome,
} from "@/lib/engine";
import type { CompiledItem, GamesView } from "@/lib/engine/iee/dsl";
import { grantAnchor, participates } from "@/lib/engine/iee/resolve/live";
import {
  NO_POOL_SHAPE,
  drawDistinct,
  drawWeighted,
  favourOf,
  narrowsPool,
  offersChoice,
  poolAllows,
  poolShapeOf,
  type PoolShape,
} from "@/lib/engine/iee/resolve/pool";
import type { IeeDecisionRow, IeeInstanceRow } from "@/db/schema";

import type { DecisionChoice } from "@/lib/engine/iee/resolve/decisions";

import * as executor from "../executor";
import {
  addRollConditions,
  applyPendingDefaults,
  conditionTextOf,
  endRollConditions,
  factsOfRows,
  grant,
  offeredGames,
  openGameChoice,
  openReactionWindow,
  poolSources,
  recordPool,
  resolveDecision,
  settleGameChoice,
  settleReactionWindow,
  type BoardInfo,
  type ExecContext,
  type GameChoiceContext,
  type GrantInput,
  type GrantResult,
} from "../executor";
import type { SeasonRegistry } from "../registry";
import {
  applyWheels,
  holdsReactionItem,
  hooksOver,
  liveSources,
  mayReact,
  noHooks,
  reactionOffers,
  rememberedPlayers,
  settleTurnHooks,
  type PoolContext,
  type ReactionOffer,
  type TurnHooks,
} from "../turn";
import { carryOutItemUse, decideItemUse } from "../use";
import { memoryStore, type JournalRow } from "./memory-store";

export type SimStatus = IeePlayerSnapshot["status"];

/** A participant's row, as `season_players` would hold it. */
export interface SimPlayer {
  id: string;
  position: number;
  /** Resolved rolls — the clock durations count against. */
  rollSeq: number;
  /** Moves made — `count(moves)`: one per resolved turn. */
  moveCount: number;
  streakPass: number;
  streakDrop: number;
  status: SimStatus;
  /** A game rolled and not reported yet. */
  inFlight: boolean;
  /** Where the last regular move started — «Камень времени» returns there. */
  lastMoveStart: number | null;
  /** The dice sum of the last regular move — what «Магнит» compares against; null before the first. */
  lastRoll: number | null;
  /** The game in flight, of the season's pool (wave C); null for none — or one the pool does not know. */
  game: string | null;
  /** Every game of the pool the player has had: no draw hands one out again. */
  had: string[];
  /** The games they passed, oldest first — what the next game's rules read (§6.16). */
  passed: string[];
  /** Games set aside, the roll counter each comes back at (§6.16), and the roll it comes back on. */
  aside: { gameId: string; until: number; rollId: string | null }[];
  /** The roll of the game in flight — what its completion conditions are held by (§6.17); null for none. */
  roll: string | null;
}

export type SimPlayerInit = Partial<Omit<SimPlayer, "had" | "aside" | "roll">> & { id: string; balance?: number };

/** A game of the season's pool, as the simulation draws it (wave C, spec §5.5). */
export interface SimGame {
  id: string;
  title: string;
  genres: readonly string[];
  year: number | null;
  rating: number | null;
}

export interface SimSeasonInput {
  seasonId?: string;
  registry: SeasonRegistry;
  config: SeasonConfig;
  players: readonly SimPlayerInit[];
  /** The board: the cell at a position, null where there is none. */
  cellAt: (position: number) => TurnCell | null;
  /** Server randomness — rules, the wheel, and the dice unless a turn chooses them. */
  rng: () => number;
  /** The season's game pool, in its order (wave C): what a pick draws from. None unless given. */
  games?: readonly SimGame[];
  /** The draw's own randomness — which game of those left comes up; the season's when omitted. */
  poolRng?: () => number;
}

export interface SimTurnInput {
  player: string;
  outcome: "passed" | "dropped";
  /** The dice's randomness once they are composed; the season's when omitted. */
  dice?: (composition: { count: number; sides: number }) => () => number;
  /** The board for this turn only — a scenario names the cell a move ends on. */
  cellAt?: (position: number) => TurnCell | null;
  /** Whether a bonus or penalty landing spins its wheel (the sandbox) or only says it would (scenarios). */
  spin: boolean;
  /** The wheel's randomness for this turn; the season's when omitted. */
  wheelRng?: () => number;
  /**
   * The reaction window (wave B, spec §7.4): the offered reaction item the
   * roller uses — its instance — or null to accept. Without it a window that
   * opens is accepted.
   */
  react?: (window: { view: ReactionView; offers: readonly ReactionOffer[] }) => string | null;
}

export interface SimTurn {
  player: string;
  /** The roll this turn resolved. */
  rollSeq: number;
  from: number;
  played: PlayedTurn;
  /** What the wheel handed out; null when it did not spin. */
  wheel: WheelOutcome | null;
  /** What each wheel spun once more handed out (wave B, `extraSpin`), in order. */
  extraWheels: WheelOutcome[];
  /** Whether a reaction window opened, and how it was answered (wave B, §7.4). */
  window: "none" | "accepted" | "used";
  /** The journal rows the turn wrote, in order. */
  journal: JournalRow[];
}

export interface SimUseInput {
  player: string;
  /** Which held item: an instance, or the newest active one of an entry (key or entry id). */
  item: { instanceId: string } | { entry: string };
  /** The player named as the target, or null. */
  target: string | null;
  /** The holder's own instance picked, for an item that asks for one (spec §6.10). */
  choice?: string | null;
  /** The entry of the season's catalog picked — id or key — for an item that asks for one (spec §6.12). */
  entryChoice?: string | null;
  /** What the use picks for the next game, for an item that asks (wave C, spec §6.16). */
  pick?: PickRequest | null;
  /** A choice of games the use opens — a game rerolled (§7.12): the game taken, by id. */
  take?: string | null;
}

export interface SimDrawInput {
  player: string;
  /** A choice of games the draw opens: the game taken, by id; it waits otherwise. */
  take?: string | null;
}

export interface SimDraw {
  result: "drawn" | "choosing" | "refused";
  /** Why it was refused — the game's own codes. */
  code: string | null;
  journal: JournalRow[];
}

export interface SimUse {
  ok: boolean;
  /** Why it was refused — the item path's own codes. */
  code: string | null;
  item: CompiledItem | null;
  /** Whom the use reached. */
  target: string | null;
  journal: JournalRow[];
}

export interface SimDecideInput {
  player: string;
  /** The answer; the default — as it stands now — when null. */
  choice: DecisionChoice | null;
}

export interface SimDecide {
  ok: boolean;
  /** Why it was refused — nothing pending, or an answer that does not fit. */
  code: string | null;
  journal: JournalRow[];
}

/**
 * How a bot answers its reaction window (§7.4) — what the power of a reaction
 * item assumes a player does (§6.15): on a bad throw, the offer expected to
 * gain the most; otherwise it accepts.
 */
export function botReactionPolicy(window: { view: ReactionView; offers: readonly ReactionOffer[] }): string | null {
  return chooseReaction(window.view, window.offers)?.instanceId ?? null;
}

/** Thrown when a turn is asked of someone who cannot take one. */
export class SimError extends Error {
  constructor(
    readonly code: "unknown_player" | "player_not_active",
    readonly player: string,
  ) {
    super(`${code}: ${player}`);
  }
}

export type SimSeason = ReturnType<typeof simSeason>;

export function simSeason(input: SimSeasonInput) {
  const seasonId = input.seasonId ?? "sim";
  const { registry, config, rng } = input;
  const players = new Map<string, SimPlayer>(
    input.players.map((p) => [
      p.id,
      {
        id: p.id,
        position: p.position ?? 0,
        rollSeq: p.rollSeq ?? 0,
        moveCount: p.moveCount ?? 0,
        streakPass: p.streakPass ?? 0,
        streakDrop: p.streakDrop ?? 0,
        status: p.status ?? "active",
        inFlight: p.inFlight ?? false,
        lastMoveStart: p.lastMoveStart ?? null,
        lastRoll: p.lastRoll ?? null,
        game: p.game ?? null,
        // What they have had: the games they passed and the one in flight.
        had: [...new Set([...(p.passed ?? []), ...(p.game ? [p.game] : [])])],
        passed: [...(p.passed ?? [])],
        aside: [],
        // A game given in flight was rolled before the season began: it holds no conditions.
        roll: p.game ? `sim:${p.id}:roll:0` : null,
      },
    ]),
  );
  const pool: readonly SimGame[] = input.games ?? [];
  const poolRng = input.poolRng ?? rng;
  let rolls = 0;
  const mem = memoryStore({
    balances: Object.fromEntries(input.players.map((p) => [p.id, p.balance ?? config.points.startingBalance])),
    // Out-of-turn moves write the participants' rows, as they write `season_players`.
    places: {
      list: () => [...players.values()].map((p) => ({ id: p.id, position: p.position, status: p.status })),
      set: (id, position, finished) => {
        const p = players.get(id);
        if (!p) return;
        p.position = position;
        if (finished) p.status = "finished";
      },
      lastMoveStart: (id) => players.get(id)?.lastMoveStart ?? null,
    },
  });
  /** The board an out-of-turn move lands on: the season's size, and its finish where the board has one. */
  const board: BoardInfo = (() => {
    let finishAt: number | null = null;
    for (let position = 0; position < config.board.size; position++) {
      if (input.cellAt(position)?.cellType === "finish") {
        finishAt = position;
        break;
      }
    }
    return { size: config.board.size, loop: config.board.loop, finishAt };
  })();

  const playerOf = (id: string): SimPlayer => {
    const p = players.get(id);
    if (!p) throw new SimError("unknown_player", id);
    return p;
  };
  const balanceOf = (id: string): number => mem.balances.get(id) ?? 0;
  /** The season clock: every participant's resolved rolls (`getSeasonRollSeq`). */
  const seasonRollSeq = () => [...players.values()].reduce((sum, p) => sum + p.rollSeq, 0);
  const active = () => [...players.values()].filter((p) => p.status === "active");

  function snapshot(id: string): IeePlayerSnapshot {
    const p = players.get(id);
    if (!p) {
      // As the real context does for a participant gone mid-transaction.
      return { seasonPlayerId: id, position: 0, balancePoints: 0, rollSeq: 0, moveCount: 0, rank: 1, status: "withdrawn" };
    }
    return {
      seasonPlayerId: p.id,
      position: p.position,
      balancePoints: balanceOf(p.id),
      rollSeq: p.rollSeq,
      moveCount: p.moveCount,
      // 1 = leader; ties share the better rank, as the leaderboard does.
      rank: active().filter((o) => o.position > p.position).length + 1,
      behind: active().filter((o) => o.id !== p.id && o.position < p.position).length,
      lastRoll: p.lastRoll,
      status: p.status,
    };
  }

  /** Where the players a holder's effects remember stand now (spec §6.11). */
  function rememberedOf(rows: readonly IeeInstanceRow[]): Map<string, IeePlayerSnapshot> {
    return new Map(rememberedPlayers(rows).flatMap((id) => (players.has(id) ? [[id, snapshot(id)] as const] : [])));
  }

  function context(actor: string | null, clock: number = seasonRollSeq()): ExecContext {
    return {
      store: mem.store,
      seasonId,
      registry,
      config: config.iee,
      seasonRollSeq: clock,
      actorPlayerId: actor,
      actorUserId: null,
      rng,
      snapshot: async (id) => snapshot(id),
      anchorFor: async (id) => {
        const p = players.get(id);
        const holderRollSeq = p?.rollSeq ?? 0;
        return { anchorRollSeq: grantAnchor(holderRollSeq, p?.inFlight ?? false) };
      },
      board: async () => board,
    };
  }

  /** Active instances a participant holds, newest first. */
  const holdings = (id: string): Promise<IeeInstanceRow[]> => mem.store.activeForHolder(id);

  // --- the next game (wave C, spec §6.16, §7.12) -------------------------------

  const gameOf = (id: string) => pool.find((g) => g.id === id) ?? null;
  const lower = (genres: readonly string[]) => [...new Set(genres.map((g) => g.toLowerCase()))];

  /** The holder's games as the next game's rules read them, as `gamesViewOf` does. */
  function gamesView(p: SimPlayer): GamesView {
    const last = p.passed.at(-1);
    return { lastPassed: last ? lower(gameOf(last)?.genres ?? []) : null, passed: lower(p.passed.flatMap((id) => gameOf(id)?.genres ?? [])) };
  }

  /** The next game of a player, as the game service picks it (`pickNextGame`) — nothing written. */
  type SimNext =
    | { kind: "none" }
    | { kind: "returned"; gameId: string; rollId: string | null }
    | { kind: "game"; game: SimGame; shape: PoolShape; relaxed: boolean; favoured: boolean }
    | { kind: "choice"; games: SimGame[]; shape: PoolShape; relaxed: boolean };
  async function nextGame(p: SimPlayer): Promise<SimNext> {
    // A set-aside game that is due is their game: no draw, no rules.
    const due = [...p.aside].sort((a, b) => a.until - b.until).find((a) => a.until <= p.rollSeq);
    if (due) return { kind: "returned", gameId: due.gameId, rollId: due.rollId };
    let shape: PoolShape = NO_POOL_SHAPE;
    if (config.iee.enabled) {
      const rows = await holdings(p.id);
      const sources = poolSources(registry, rows, p.rollSeq + 1);
      if (sources.length > 0) shape = poolShapeOf(sources, { self: snapshot(p.id), selfEntries: factsOfRows(registry, rows), games: gamesView(p), rng });
    }
    const left = pool.filter((g) => !p.had.includes(g.id));
    const allowed = left.filter((g) => poolAllows(g, shape));
    // With nothing left, the exclusions and requirements are set aside (§6.16).
    const candidates = allowed.length > 0 ? allowed : left;
    if (candidates.length === 0) return { kind: "none" };
    const relaxed = allowed.length === 0 && narrowsPool(shape);
    // A favoured game ahead of the rest, in the pool's order otherwise (spec §5.5).
    const ordered = [...candidates].sort((a, b) => favourOf(b.id, shape) - favourOf(a.id, shape));
    if (offersChoice(shape, ordered.length)) return { kind: "choice", games: drawDistinct(ordered, shape, shape.choice, poolRng), shape, relaxed };
    const game = drawWeighted(ordered, shape, poolRng)!;
    return { kind: "game", game, shape, relaxed, favoured: favourOf(game.id, shape) > 1 };
  }

  /** The pending choice of games a player has, if one waits (§7.12). */
  async function pendingGameChoice(id: string): Promise<IeeDecisionRow | null> {
    return (await mem.store.pendingDecisions(id)).find((d) => d.kind === "game_choice") ?? null;
  }

  /** Starts the next game as the game service does (`startNextGame`): the game in flight, or the choice. */
  async function startGame(
    p: SimPlayer,
    next: Exclude<SimNext, { kind: "none" }>,
    how: { origin: GameChoiceContext["origin"]; item: CompiledItem | null },
  ): Promise<IeeDecisionRow | null> {
    const exec = context(p.id);
    if (next.kind === "returned") {
      p.aside = p.aside.filter((a) => a.gameId !== next.gameId);
      p.game = next.gameId;
      p.inFlight = true;
      // Its own roll, open again — and the holder's rules asked again (§6.17).
      await assigned(p, next.rollId ?? `sim:${p.id}:roll:${++rolls}`);
      return null;
    }
    if (next.kind === "choice") {
      const opened = await openGameChoice(exec, {
        playerId: p.id,
        context: {
          origin: how.origin,
          replacedRollId: how.origin === "roll" ? null : `sim:${p.id}:replaced`,
          itemKey: how.item?.key ?? null,
          names: how.item?.names ?? null,
          games: next.games.map((g) => ({ gameId: g.id, title: g.title, coverUrl: null, genres: [...g.genres], year: g.year, rating: g.rating, platform: null })),
        },
      });
      await recordPool(exec, { playerId: p.id, shape: next.shape, to: { decisionId: opened.id, offered: next.games.map((g) => g.id) }, relaxed: next.relaxed });
      return opened;
    }
    const rollId = `sim:${p.id}:roll:${++rolls}`;
    p.game = next.game.id;
    p.had.push(next.game.id);
    p.inFlight = true;
    if (next.shape.firings.length > 0) {
      await recordPool(exec, { playerId: p.id, shape: next.shape, to: { rollId, gameId: next.game.id, favoured: next.favoured }, relaxed: next.relaxed });
    }
    await assigned(p, rollId);
    return null;
  }

  /** A game is the player's now (§6.17): its roll, and the completion conditions their rules give it. */
  async function assigned(p: SimPlayer, rollId: string) {
    p.roll = rollId;
    if (config.iee.enabled) await addRollConditions(context(p.id), { playerId: p.id, rollId, rollSeq: p.rollSeq + 1 });
  }

  /** The game in flight ends — reported, replaced or set aside (§6.17): the conditions it holds end with it. */
  async function ended(p: SimPlayer, exec: ExecContext = context(p.id)) {
    const rollId = p.roll;
    p.roll = null;
    if (rollId && config.iee.enabled) await endRollConditions(exec, { rollId, playerId: p.id });
  }

  /** Takes a game a pending choice offers (§7.12): it is the player's game now. */
  async function take(p: SimPlayer, gameId: string): Promise<{ ok: boolean; code: string | null }> {
    const pending = await pendingGameChoice(p.id);
    if (!pending) return { ok: false, code: "ieeDecisionNotFound" };
    const rollId = `sim:${p.id}:roll:${++rolls}`;
    const settled = await settleGameChoice(context(p.id), { decisionId: pending.id, gameId, rollId, userId: null });
    if (!settled.ok) return { ok: false, code: settled.code };
    p.game = gameId;
    p.had.push(gameId);
    p.inFlight = true;
    await assigned(p, rollId);
    return { ok: true, code: null };
  }

  /**
   * The cells an object may stand on now (wave D, spec §6.18), as the game's
   * board offers them: not the start, not the finish, not one taken.
   */
  async function freeCells(): Promise<number[]> {
    const taken = new Set((await mem.store.activeObjects(seasonId)).map((o) => o.holderCellIndex));
    const out: number[] = [];
    for (let position = 0; position < config.board.size; position++) {
      const type = input.cellAt(position)?.cellType ?? "normal";
      if (type !== "start" && type !== "finish" && !taken.has(position)) out.push(position);
    }
    return out;
  }

  /** The pick as the season's pool offers it to the player (`offeredPick`): what they have not had; a cell, as the board does. */
  async function offeredPick(p: SimPlayer, pick: PickRequest): Promise<UsePick | null> {
    if ("cell" in pick) return (await freeCells()).includes(pick.cell) ? { cell: pick.cell } : null;
    const left = pool.filter((g) => !p.had.includes(g.id));
    if ("genre" in pick) {
      const genre = pick.genre.trim().toLowerCase();
      return left.some((g) => g.genres.some((x) => x.toLowerCase() === genre)) ? { genre } : null;
    }
    if ("years" in pick) {
      const [from, to] = pick.years;
      if (from % 10 !== 0 || to !== from + 9) return null;
      return left.some((g) => g.year !== null && g.year >= from && g.year <= to) ? { years: [from, to] } : null;
    }
    const game = left.find((g) => g.id === pick.gameId);
    return game ? { gameId: game.id, title: game.title } : null;
  }

  /**
   * What the season's pool offers a pick of a kind (§6.16), as the dashboard
   * lists it: the genres, the decades and the games of what the player has
   * not had.
   */
  async function pickOptions(id: string, kind: PickKind): Promise<UsePick[]> {
    if (kind === "cell") return (await freeCells()).map((cell) => ({ cell }));
    const p = playerOf(id);
    const left = pool.filter((g) => !p.had.includes(g.id));
    if (kind === "genre") return [...new Set(left.flatMap((g) => lower(g.genres)))].sort().map((genre) => ({ genre }));
    if (kind === "years") {
      const decades = [...new Set(left.flatMap((g) => (g.year === null ? [] : [Math.floor(g.year / 10) * 10])))].sort((a, b) => a - b);
      return decades.map((from) => ({ years: [from, from + 9] as [number, number] }));
    }
    return left.map((g) => ({ gameId: g.id, title: g.title }));
  }

  /** Takes a game the player's pending choice offers (§7.12), as the dashboard answers it. */
  async function takeGame(d: { player: string; gameId: string }): Promise<SimDecide> {
    const p = playerOf(d.player);
    const start = mem.journal.length;
    const taken = await take(p, d.gameId);
    return { ok: taken.ok, code: taken.code, journal: mem.journal.slice(start) };
  }

  /**
   * A player's next game picked, as rolling picks it (`rollNewGame`, §7.12): a
   * game in flight or a choice already waiting refuses it; what still waits
   * takes its default as the next game starts.
   */
  async function draw(d: SimDrawInput): Promise<SimDraw> {
    const p = playerOf(d.player);
    const start = mem.journal.length;
    const refused = (code: string): SimDraw => ({ result: "refused", code, journal: mem.journal.slice(start) });
    if (p.inFlight) return refused("gameAlreadyHaveRoll");
    if (config.iee.enabled && (await pendingGameChoice(p.id))) return refused("ieeDecisionPending");
    const next = await nextGame(p);
    if (next.kind === "none") return refused("catalogAllPlayed");
    if (config.iee.enabled) await applyPendingDefaults(context(p.id), p.id);
    const choice = await startGame(p, next, { origin: "roll", item: null });
    const taken = choice && d.take ? (await take(p, d.take)).ok : false;
    return { result: choice && !taken ? "choosing" : "drawn", code: null, journal: mem.journal.slice(start) };
  }

  /**
   * The game in flight replaced or set aside by an item's use (§6.16), after
   * its charge is spent: the roll ends — set aside until its pick comes — and
   * the next game starts, as the item path does.
   */
  async function replaceGame(p: SimPlayer, intent: GameIntent, next: Exclude<SimNext, { kind: "none" }>, item: CompiledItem, takeId: string | null) {
    const until = intent.how === "postpone" ? p.rollSeq + (intent.afterRolls ?? 2) - 1 : null;
    // A game the pool does not know cannot come back: it only ends.
    if (until !== null && p.game) p.aside.push({ gameId: p.game, until, rollId: p.roll });
    p.game = null;
    p.inFlight = false;
    await ended(p);
    const choice = await startGame(p, next, { origin: intent.how === "postpone" ? "postpone" : "reroll", item });
    if (choice && takeId) await take(p, takeId);
  }

  /** The holder's statuses for a turn, as `loadTurnHooks` reads them. */
  async function hooksFor(p: SimPlayer, turnRollSeq: number): Promise<TurnHooks> {
    if (!config.iee.enabled) return noHooks();
    const rows = await holdings(p.id);
    const effects = liveSources(registry, rows, rememberedOf(rows));
    if (!effects.some((e) => participates(e.anchorRollSeq, turnRollSeq))) return noHooks();
    return hooksOver({ effects, self: snapshot(p.id), selfEntries: factsOfRows(registry, rows), rng });
  }

  /** What the wheel's picker reads, as `loadPoolContext` does — every instance ever granted counts as a drop. */
  async function poolContext(p: SimPlayer, landedAt: number): Promise<PoolContext> {
    const counters: { perSeason: Record<string, number>; perPlayer: Record<string, number>; lastDropRollSeq: Record<string, number> } = {
      perSeason: {},
      perPlayer: {},
      lastDropRollSeq: {},
    };
    for (const row of mem.instances) {
      const entry = registry.get(row.entryId);
      // A condition an entry added to a roll is no drop of it (§6.17), nor an item standing on the board (§6.18).
      if (!entry || row.kind === "roll_condition" || row.kind === "board_object") continue;
      counters.perSeason[entry.key] = (counters.perSeason[entry.key] ?? 0) + 1;
      if (row.holderPlayerId === p.id) counters.perPlayer[entry.key] = (counters.perPlayer[entry.key] ?? 0) + 1;
      counters.lastDropRollSeq[entry.key] = Math.max(counters.lastDropRollSeq[entry.key] ?? 0, row.grantedRollSeq);
    }
    const activeEffectKeys: string[] = [];
    const heldItemKeys: string[] = [];
    const activeTagCounts: Record<string, number> = {};
    let heldItemCount = 0;
    for (const row of await holdings(p.id)) {
      const entry = registry.get(row.revisionId);
      if (!entry) continue;
      for (const tag of entry.tags) activeTagCounts[tag] = (activeTagCounts[tag] ?? 0) + 1;
      if (row.kind === "effect") activeEffectKeys.push(entry.key);
      else if (row.kind === "item") {
        heldItemKeys.push(entry.key);
        if (entry.character === "bonus") heldItemCount += 1;
      }
    }
    return {
      counters: counters satisfies PoolCounters,
      player: snapshot(p.id),
      activeEffectKeys,
      activeTagCounts,
      heldItemCount,
      seasonRollSeq: seasonRollSeq(),
      playerCount: active().length,
      playersBehind: active().filter((o) => o.id !== p.id && o.position < landedAt).length,
      heldItemKeys,
    };
  }

  /** Moves points the way the turn writes them: the new balance and a ledger line. */
  function writeBalance(id: string, balance: number, line: { delta: number; reason: string } | null) {
    mem.balances.set(id, balance);
    if (line) mem.ledger.push({ seasonPlayerId: id, delta: line.delta, reason: line.reason });
  }

  /**
   * One resolved turn, in the order `applyResolvedTurn` runs it: the
   * statuses are read, the turn is played, the participant's row is written,
   * the wheel spins, `onOutcome` / `onTick` points land, and the turn settles.
   */
  async function turn(t: SimTurnInput): Promise<SimTurn> {
    const p = playerOf(t.player);
    if (p.status !== "active") throw new SimError("player_not_active", p.id);
    const start = mem.journal.length;
    // Starting the next game answers what still waits with its default (§7.6) — a game already rolled has started.
    if (!p.inFlight && config.iee.enabled) await applyPendingDefaults(context(p.id), p.id);
    const from = p.position;
    const turnRollSeq = p.rollSeq + 1;
    const hooks = await hooksFor(p, turnRollSeq);
    const turnBase = { rollSeq: turnRollSeq, outcome: t.outcome };
    // A reaction window may open on the roller's own throw (§7.4), as the game's turn opens it.
    const rows = config.iee.enabled ? await holdings(p.id) : [];
    const reacting =
      holdsReactionItem(registry, rows) &&
      mayReact({ registry, rows, self: snapshot(p.id), victimChoicePending: (await pendingChoice(p.id)) !== null, rng });
    const seen: { window: { view: ReactionView; offers: ReactionOffer[] } | null; used: ReactionOffer | null } = { window: null, used: null };
    // The objects on the board act on the move's way (wave D, spec §7.7).
    const objects = config.iee.enabled ? await mem.store.activeObjects(seasonId) : [];
    const board = objects.length > 0 ? executor.boardObjects({ registry, rng }, objects, { self: snapshot(p.id), selfEntries: factsOfRows(registry, rows) }) : null;

    const played = playTurn({
      position: p.position,
      balancePoints: balanceOf(p.id),
      streakPass: p.streakPass,
      streakDrop: p.streakDrop,
      config,
      turn: turnBase,
      cellAt: t.cellAt ?? input.cellAt,
      hooks: hooks.run,
      diceRng: t.dice ?? (() => rng),
      ...(reacting
        ? {
            react: (view: ReactionView) => {
              const offers = reactionOffers({ registry, rows, view, self: snapshot(p.id), rollSeq: turnRollSeq, rng });
              if (offers.length === 0) return null;
              const pick = t.react?.({ view, offers }) ?? null;
              seen.window = { view, offers };
              seen.used = pick ? (offers.find((o) => o.instanceId === pick) ?? null) : null;
              return seen.used?.rules ?? null;
            },
          }
        : {}),
      ...(board ? { objectAt: board.objectAt } : {}),
    });
    // Read before the writes, as the game reads it before its transaction.
    const wheels = [...(played.wheel ? [played.wheel] : []), ...played.extraWheels];
    const wheelContext = wheels.length > 0 && t.spin && config.iee.enabled ? await poolContext(p, played.finalPosition) : null;

    p.lastMoveStart = from;
    // What `moves.dice_results` keeps: the faces that counted.
    p.lastRoll = played.diceResults.reduce((a, b) => a + b, 0);
    p.position = played.finalPosition;
    writeBalance(p.id, played.moveBalance, played.moveLedger);
    p.streakPass = played.newStreakPass;
    p.streakDrop = played.newStreakDrop;
    p.rollSeq = turnRollSeq;
    p.moveCount += 1;
    p.inFlight = false;
    // The game reported: a pass is one more game passed (§6.16).
    if (p.game && t.outcome === "passed") p.passed.push(p.game);
    p.game = null;
    if (played.reachedFinish) p.status = "finished";

    const exec = context(p.id, wheelContext?.seasonRollSeq);
    // The completion conditions the game held end with it (§6.17).
    await ended(p, exec);
    // The window and its answer, as the game writes them: opened, the item's charge, the answer (§7.4).
    const window = seen.window;
    if (window) {
      const opened = await openReactionWindow(exec, {
        playerId: p.id,
        context: { rollId: `sim:${p.id}:${turnRollSeq}`, outcome: t.outcome, view: { faces: [...window.view.faces] } },
        offers: window.offers.map((o) => ({ instanceId: o.instanceId, key: o.key })),
      });
      const used = seen.used;
      if (used) await executor.useCharge(exec, { instanceId: used.instanceId, targetPlayerId: null });
      await settleReactionWindow(exec, opened, {
        choice: used ? { option: "react", picks: [used.instanceId] } : { option: "accept" },
        by: "player",
        userId: null,
        before: played.reaction?.before ?? played.diceResults,
        after: played.reaction?.after ?? played.diceResults,
      });
    }
    // The objects the move met acted, and are gone (§6.18), as the game writes them.
    if (played.objects.length > 0) await executor.triggerObjects(exec, { mover: p.id, fired: played.objects, ...(board ? { draws: board.draws } : {}) });
    // The move ended where others stand (§6.19): their entries answer the rival who arrived.
    if (config.iee.enabled && !played.moveCancelled && played.finalPosition !== from) {
      await executor.sameCell(exec, { arrived: p.id, at: played.finalPosition, reveal: false });
    }
    let wheel: WheelOutcome | null = null;
    let extraWheels: WheelOutcome[] = [];
    if (wheelContext) {
      const spun = await applyWheels(exec, {
        sp: { id: p.id },
        wheels,
        iee: config.iee,
        context: wheelContext,
        moveId: null,
        turnRollSeq,
        rng: t.wheelRng ?? rng,
      });
      const own = played.wheel ? 1 : 0;
      wheel = own ? spun.outcomes[0]! : null;
      extraWheels = spun.outcomes.slice(own);
    }
    for (const line of played.later) writeBalance(p.id, line.balance, line);
    await settleTurnHooks(exec, hooks, {
      seasonPlayerId: p.id,
      turnRollSeq,
      outcome: t.outcome,
      moved: !played.moveCancelled,
      reveal: false,
    });
    const answered = window ? (seen.used ? "used" : "accepted") : "none";
    return { player: p.id, rollSeq: turnRollSeq, from, played, wheel, extraWheels, window: answered, journal: mem.journal.slice(start) };
  }

  /** Using a held item, the way `activateInventoryItem` does. */
  async function use(u: SimUseInput): Promise<SimUse> {
    const p = playerOf(u.player);
    const start = mem.journal.length;
    const refuse = (code: string, item: CompiledItem | null = null): SimUse => ({
      ok: false,
      code,
      item,
      target: null,
      journal: mem.journal.slice(start),
    });

    let row: IeeInstanceRow | null;
    if ("instanceId" in u.item) {
      row = await mem.store.getInstance(u.item.instanceId);
    } else {
      const wanted = registry.get(u.item.entry);
      const mine = mem.instances.filter((i) => i.holderPlayerId === p.id && i.kind === "item" && i.entryId === wanted?.entryId);
      row = (await holdings(p.id)).find((r) => r.kind === "item" && r.entryId === wanted?.entryId) ?? null;
      // Held once and spent is "already used"; never held is "not found".
      if (!row) return refuse(mine.length > 0 ? "ieeItemAlreadyUsed" : "ieeItemNotFound", wanted && wanted.kind === "item" ? wanted : null);
    }
    if (!row || row.kind !== "item" || row.holderPlayerId !== p.id) return refuse("ieeItemNotFound");
    // A passive item without charges has none to spend — the guards refuse it as unusable.
    if (row.status !== "active" || (row.chargesLeft !== null && row.chargesLeft <= 0)) return refuse("ieeItemAlreadyUsed");
    const item = registry.item(row.revisionId);
    if (!item) return refuse("ieeItemNotFound");

    const candidate = u.target === null ? null : players.has(u.target) ? snapshot(u.target) : null;
    const decided = await decideItemUse({
      registry,
      item,
      params: (row.params ?? {}) as Record<string, string | number | boolean>,
      hasOpenRoll: p.inFlight,
      actor: snapshot(p.id),
      candidate,
      targetInSameSeason: u.target === null || players.has(u.target),
      allowTargetingOthers: config.iee.allowTargetingOthers,
      pvpProtectionMoves: config.iee.pvpProtectionMoves,
      rowsOf: holdings,
      rng,
      choice: u.choice ?? null,
      entryChoice: u.entryChoice ?? null,
      instanceId: row.id,
      standings: [...players.values()].map((o) => ({ seasonPlayerId: o.id, position: o.position, status: o.status })),
      decisionPending: (await mem.store.pendingDecisions(p.id)).length > 0,
      pick: u.pick ?? null,
      offeredPick: async (pick) => offeredPick(p, pick),
      // An object needs room among its owner's (wave D, §6.18).
      objects: {
        owned: (await mem.store.activeObjects(seasonId)).filter((o) => o.ownerPlayerId === p.id).length,
        limit: config.iee.boardObjectsPerPlayer,
      },
    });
    if (!decided.ok) return refuse(decided.code, item);
    const target = decided.target?.seasonPlayerId ?? null;
    // The game in flight (§6.16): the next game is picked before anything is spent.
    const gameIntent = decided.outcome.intents.find((i): i is GameIntent => i.kind === "game") ?? null;
    const next = gameIntent ? await nextGame(p) : null;
    if (next?.kind === "none") return refuse("catalogAllPlayed", item);
    const done = await carryOutItemUse(context(p.id), { instanceId: row.id, holder: p.id, target, outcome: decided.outcome });
    if (!done) return refuse("ieeItemAlreadyUsed", item);
    if (gameIntent && next) await replaceGame(p, gameIntent, next, item, u.take ?? null);
    return { ok: true, code: null, item, target, journal: mem.journal.slice(start) };
  }

  /** A participant's pending victim choice, if one waits (§7.6). */
  async function pendingChoice(id: string) {
    return (await mem.store.pendingDecisions(id)).find((d) => d.kind === "victim_choice") ?? null;
  }

  /** Answers a participant's pending victim choice, as the dashboard does (§7.6). */
  async function decide(d: SimDecideInput): Promise<SimDecide> {
    const p = playerOf(d.player);
    const start = mem.journal.length;
    const pending = await pendingChoice(p.id);
    if (!pending) return { ok: false, code: "ieeDecisionNotFound", journal: [] };
    const answered = await resolveDecision(context(p.id), { decisionId: pending.id, choice: d.choice, by: "player" });
    return { ok: answered.ok, code: answered.ok ? null : answered.code, journal: mem.journal.slice(start) };
  }

  /** Hands an entry out through the executor, as a reward or an admin grant would. */
  async function give(entry: string, to: string, options: Partial<Omit<GrantInput, "entry" | "to">> = {}): Promise<GrantResult> {
    playerOf(to);
    return grant(context(null), { entry, to, source: options.source ?? "sim", reveal: false, ...options });
  }

  /**
   * An object standing on the board before anything happens — a scenario's
   * Given (wave D, spec §6.18): the item's instance held by the cell, its
   * owner's as their use would have placed it. False for an entry that is not
   * an item, or a cell an object may not stand on now.
   */
  async function place(entry: string, owner: string, cell: number): Promise<boolean> {
    playerOf(owner);
    const item = registry.item(entry);
    if (!item || !(await freeCells()).includes(cell)) return false;
    await mem.store.insertInstance({
      id: randomUUID(),
      seasonId,
      entryId: item.entryId,
      revisionId: item.revisionId,
      kind: "board_object",
      holderKind: "cell",
      holderPlayerId: null,
      holderCellIndex: cell,
      ownerPlayerId: owner,
      params: registry.start(item).params,
      chargesLeft: null,
      remaining: null,
      remainingUnit: null,
      anchorRollSeq: null,
      source: "sim",
      sourceMoveId: null,
      causeJournalId: null,
      grantedRollSeq: seasonRollSeq(),
    });
    return true;
  }

  return {
    seasonId,
    registry,
    config,
    store: mem,
    players,
    player: playerOf,
    balance: balanceOf,
    snapshot,
    holdings,
    context,
    turn,
    use,
    give,
    place,
    decide,
    pendingChoice,
    draw,
    takeGame,
    pickOptions,
    pendingGameChoice,
    /** A game of the season's pool by its id; null for one it does not know. */
    game: gameOf,
    /** The completion conditions the player's game in flight holds, oldest first (§6.17). */
    conditions: async (id: string) => {
      const p = playerOf(id);
      if (!p.roll) return [];
      return (await mem.store.activeForRoll(p.roll)).flatMap((row) => {
        const text = conditionTextOf(row);
        return text ? [{ entryId: row.entryId, text }] : [];
      });
    },
    /** The objects standing on the board (wave D, §6.18), oldest first: where, what and whose. */
    objects: async () =>
      (await mem.store.activeObjects(seasonId)).map((row) => ({ instanceId: row.id, cell: row.holderCellIndex!, entryId: row.entryId, owner: row.ownerPlayerId })),
    /** How many games a player's pending choice offers; 0 for none. */
    offered: async (id: string) => {
      const pending = await pendingGameChoice(id);
      return pending ? offeredGames(pending).length : 0;
    },
  };
}
