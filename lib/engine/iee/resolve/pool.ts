/**
 * The pick of a player's next game, as their rules shape it
 * (docs/IEE_CONSTRUCTOR_SPEC.md §6.16, §7.12) — pure: the game service loads
 * the holder's instances, asks this what their rules at `beforeGameRoll` do,
 * and hands the season's pool the answer; the pool draws with it.
 *
 * Exclusions add up, each requirement narrows the pool further, and a game
 * several rules favour weighs the largest of their factors. The season's own
 * filters come first: the holder's rules only narrow what it already allows.
 */
import type { GameMatch, IeePlayerSnapshot, PoolContribution, UsePick } from "../../types/iee";
import type { EntryFacts, GamesView } from "../dsl/runtime";
import type { AnsweringSource } from "./incoming";

/** An instance whose rules may shape the pick: an effect, or a passive or cursed item. */
export interface PoolSource extends AnsweringSource {
  /** What the use that handed the effect to its user picked (`iee_instances.chosen`); null when nothing was. */
  chosen: UsePick | null;
}

/** What the rules see of the holder as their game is picked. */
export interface PoolBase {
  self: IeePlayerSnapshot;
  selfEntries: readonly EntryFacts[];
  games: GamesView;
  rng: () => number;
}

/** One rule that spoke — what the journal keeps of it (`pool`, spec §9.2). */
export interface PoolFiring {
  instanceId: string;
  revisionId: string;
  key: string;
  ruleIndex: number;
  contributions: PoolContribution[];
  /** The draws its conditions made. */
  draws: number[];
}

/** What the holder's rules do to the pick of their next game. */
export interface PoolShape {
  exclude: GameMatch[];
  require: GameMatch[];
  /** Favoured games, each once, with the largest factor any rule gave it. */
  favor: { gameId: string; factor: number }[];
  /** How many games a choice offers — the largest any rule asked for; 0 for no choice (`chooseOfN`, spec §7.12). */
  choice: number;
  firings: PoolFiring[];
}

export const NO_POOL_SHAPE: PoolShape = { exclude: [], require: [], favor: [], choice: 0, firings: [] };

/**
 * What the holder's rules at `beforeGameRoll` do to the pick: each instance
 * oldest first, each rule in order, as its conditions hold (`chance` draws
 * from the server rng).
 */
export function poolShapeOf(sources: readonly PoolSource[], base: PoolBase): PoolShape {
  const shape: PoolShape = { exclude: [], require: [], favor: [], choice: 0, firings: [] };
  for (const source of sources) {
    for (const rule of source.entry.pool) {
      const draws: number[] = [];
      const rng = () => {
        const value = base.rng();
        draws.push(value);
        return value;
      };
      const contributions = rule.run({
        trigger: "beforeGameRoll",
        params: source.params,
        self: base.self,
        target: null,
        turn: null,
        selfEntries: base.selfEntries,
        targetEntries: [],
        rng,
        instanceId: source.instanceId,
        chosen: source.chosen,
        games: base.games,
      });
      if (!contributions || contributions.length === 0) continue;
      shape.firings.push({
        instanceId: source.instanceId,
        revisionId: source.entry.revisionId,
        key: source.entry.key,
        ruleIndex: rule.ruleIndex,
        contributions,
        draws,
      });
      for (const c of contributions) {
        if (c.kind === "exclude") shape.exclude.push(c.match);
        else if (c.kind === "require") shape.require.push(c.match);
        // Of several choices the largest counts (§6.16).
        else if (c.kind === "choose") shape.choice = Math.max(shape.choice, c.n);
        else {
          const known = shape.favor.find((f) => f.gameId === c.gameId);
          if (!known) shape.favor.push({ gameId: c.gameId, factor: c.factor });
          else known.factor = Math.max(known.factor, c.factor);
        }
      }
    }
  }
  return shape;
}

/** Whether the shape narrows the pool — what may be set aside when nothing is left (spec §6.16). */
export function narrowsPool(shape: PoolShape): boolean {
  return shape.exclude.length > 0 || shape.require.length > 0;
}

/** A game of the pool, as the holder's rules read it. */
export interface PoolGame {
  id: string;
  genres: readonly string[];
  /** Release year; null when the catalog does not know it. */
  year: number | null;
  /** The catalog's rating, 0–5; null when it has none. */
  rating: number | null;
}

/**
 * Whether a game is one a rule names: one of its genres in the set (in any
 * case), released within the span, rated within the bounds — each that is
 * given. A game without a release date matches no span, one without a rating
 * no bounds.
 */
export function gameMatches(game: PoolGame, match: GameMatch): boolean {
  if (match.genres) {
    const own = new Set(game.genres.map((g) => g.toLowerCase()));
    if (!match.genres.some((g) => own.has(g.toLowerCase()))) return false;
  }
  if (match.years) {
    if (game.year === null) return false;
    if (match.years.min !== null && game.year < match.years.min) return false;
    if (match.years.max !== null && game.year > match.years.max) return false;
  }
  if (match.rating) {
    if (game.rating === null) return false;
    if (match.rating.min !== null && game.rating < match.rating.min) return false;
    if (match.rating.max !== null && game.rating > match.rating.max) return false;
  }
  return true;
}

/** Whether the holder's rules let a game be drawn: no exclusion names it, every requirement does. */
export function poolAllows(game: PoolGame, shape: Pick<PoolShape, "exclude" | "require">): boolean {
  return !shape.exclude.some((m) => gameMatches(game, m)) && shape.require.every((m) => gameMatches(game, m));
}

/** How much a game weighs in the draw: its favour's factor, 1 when nobody favours it. */
export function favourOf(gameId: string, shape: Pick<PoolShape, "favor">): number {
  return shape.favor.find((f) => f.gameId === gameId)?.factor ?? 1;
}

/**
 * One of the candidates, each weighing its favour (spec §7.12 step 4) — an
 * even draw when nothing is favoured. Null for no candidates.
 */
export function drawWeighted<T extends { id: string }>(candidates: readonly T[], shape: Pick<PoolShape, "favor">, rng: () => number): T | null {
  if (candidates.length === 0) return null;
  const weights = candidates.map((c) => favourOf(c.id, shape));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * `n` different candidates, drawn one after another as `drawWeighted` draws
 * one — what a choice offers (spec §7.12 step 5). Fewer when there are fewer.
 */
export function drawDistinct<T extends { id: string }>(candidates: readonly T[], shape: Pick<PoolShape, "favor">, n: number, rng: () => number): T[] {
  const left = [...candidates];
  const out: T[] = [];
  while (out.length < n && left.length > 0) {
    const one = drawWeighted(left, shape, rng)!;
    out.push(one);
    left.splice(left.indexOf(one), 1);
  }
  return out;
}

/** Whether the shape asks for a choice the candidates can make: two games or more (spec §7.12). */
export function offersChoice(shape: Pick<PoolShape, "choice">, candidates: number): boolean {
  return shape.choice >= 2 && candidates >= 2;
}
