/**
 * Picking a participant's next game (docs/IEE_CONSTRUCTOR_SPEC.md §7.12): a
 * game they set aside that is due comes back as it is; otherwise the season's
 * pool, as their rules at `beforeGameRoll` shape it — their effects and
 * passive or cursed items exclude, require and favour games, and may ask for a
 * choice among several. Once the pick stands, the roll is written, or the
 * choice opened, with a journal row for each rule that shaped it.
 *
 * Every pick goes through here: a roll, an instant reroll, a judge's approved
 * one, an item used on an open roll. A season without items and effects picks
 * as it always has.
 */
import type { CatalogGame, SeasonPlayer } from "@/db/schema";
import type { PoolEmptyReason, SeasonConfig } from "@/lib/engine";
import type { CompiledEntry } from "@/lib/engine/iee/dsl";
import { NO_POOL_SHAPE, narrowsPool, poolShapeOf, type PoolShape } from "@/lib/engine/iee/resolve/pool";
import { createRoll, dropSetAsides, dueSetAside, endRollInFlight, gamesViewOf, pickGameForRoll, reopenSetAside } from "@/lib/modules/catalog/repository";
import { executionContext } from "@/lib/modules/iee/executor/context";
import {
  addRollConditions,
  endRollConditions,
  factsOfRows,
  givesConditions,
  openGameChoice,
  poolSources,
  recordPool,
  type DecisionNote,
  type GameChoiceContext,
  type GameOffer,
} from "@/lib/modules/iee/executor";
import type { Tx } from "@/lib/modules/iee/executor/store";
import { getSeasonRegistry } from "@/lib/modules/iee/registry";
import { listActiveInstances, toPlayerSnapshot } from "@/lib/modules/iee/repository";

import { GameLoopError } from "./errors";

/** What the next pick comes to — nothing is written yet. */
export type NextGame =
  | { kind: "none"; reason: PoolEmptyReason }
  /** A game set aside earlier that is due: it comes back as it is, on its own roll (spec §6.16). */
  | { kind: "returned"; rollId: string; game: CatalogGame; dropped: string[] }
  | { kind: "game"; game: CatalogGame; shape: PoolShape; relaxed: boolean; favoured: boolean; dropped: string[] }
  /** Two games or more the holder chooses among (`chooseOfN`, §7.12 step 5). */
  | { kind: "choice"; games: CatalogGame[]; shape: PoolShape; relaxed: boolean; dropped: string[] };

/** The next game of a participant: a set-aside one that is due, or the season's pool as their rules shape it. */
export async function pickNextGame(sp: SeasonPlayer, config: SeasonConfig, rng: () => number = Math.random): Promise<NextGame> {
  // 1. A set-aside game that is due is their game: no draw, no rules (§7.12).
  const aside = await dueSetAside(sp.id, sp.rollSeq);
  if (aside.due) return { kind: "returned", rollId: aside.due.rollId, game: aside.due.game, dropped: aside.dropped };

  let shape: PoolShape = NO_POOL_SHAPE;
  if (config.iee.enabled) {
    const registry = await getSeasonRegistry(sp.seasonId);
    const rows = await listActiveInstances(sp.id);
    // The game is the holder's next roll: what was granted while it was in flight sits it out (§7.9).
    const sources = poolSources(registry, rows, sp.rollSeq + 1);
    if (sources.length > 0) {
      const [self, games] = await Promise.all([toPlayerSnapshot(sp), gamesViewOf(sp.id)]);
      shape = poolShapeOf(sources, { self, selfEntries: factsOfRows(registry, rows), games, rng });
    }
  }
  const pick = await pickGameForRoll(sp.id, shape, rng);
  if (!pick.game) return { kind: "none", reason: pick.reason };
  const relaxed = pick.relaxed && narrowsPool(shape);
  if (pick.offered.length >= 2) return { kind: "choice", games: pick.offered, shape, relaxed, dropped: aside.dropped };
  return { kind: "game", game: pick.game, shape, relaxed, favoured: pick.favoured, dropped: aside.dropped };
}

/** What starting the next game wrote. */
export interface StartedGame {
  /** The roll the game is on — new, or a set-aside one open again; null while a choice waits. */
  rollId: string | null;
  game: CatalogGame | null;
  /** A set-aside game came back. */
  returned: boolean;
  /** The choice that waits, and how many games it offers. */
  choice: { decisionId: string; offered: number } | null;
}

/** How the pick came about — what a choice keeps, to say so once a game is taken (§4.3). */
export interface PickOrigin {
  origin: GameChoiceContext["origin"];
  /** The roll it replaces, when it replaces one. */
  replacedRollId: string | null;
  /** The item that rerolled the game or set it aside. */
  item: { key: string; names: CompiledEntry["names"] } | null;
}

/** A game a choice offers, as the dashboard shows it. */
export function gameOffer(game: CatalogGame): GameOffer {
  return {
    gameId: game.id,
    title: game.title,
    coverUrl: game.coverUrl,
    genres: [...game.genres],
    year: game.releasedAt ? game.releasedAt.getUTCFullYear() : null,
    rating: game.rating != null ? Number(game.rating) : null,
    platform: game.platform,
  };
}

/**
 * Writes the next game, inside the caller's transaction (spec §7.12): the
 * roll — a new one, or the set-aside one open again — with a `pool` row for
 * each rule that shaped it, and the completion conditions the holder's rules
 * give it (§6.17); or the choice it offers. A set-aside that will never come
 * back is let go on the way.
 */
export async function startNextGame(
  tx: Tx,
  sp: SeasonPlayer,
  config: SeasonConfig,
  next: Exclude<NextGame, { kind: "none" }>,
  how: PickOrigin & { decisions?: DecisionNote[]; rng?: () => number },
): Promise<StartedGame> {
  await dropSetAsides(tx, next.dropped);
  const execFor = async () =>
    executionContext({
      tx,
      seasonId: sp.seasonId,
      config: config.iee,
      registry: await getSeasonRegistry(sp.seasonId),
      actorPlayerId: sp.id,
      ...(how.rng ? { rng: how.rng } : {}),
      ...(how.decisions ? { decisions: how.decisions } : {}),
    });
  // The game is theirs: their rules give its roll its completion conditions (§6.17).
  const assign = async (rollId: string) => {
    if (config.iee.enabled && givesConditions(await getSeasonRegistry(sp.seasonId))) await gameAssigned(await execFor(), sp, rollId);
  };
  if (next.kind === "returned") {
    const reopened = await reopenSetAside(tx, next.rollId);
    if (!reopened) throw new GameLoopError("gameRollAlreadyResolved");
    // A game come back asks the holder's rules again.
    await assign(reopened.id);
    return { rollId: reopened.id, game: next.game, returned: true, choice: null };
  }
  if (next.kind === "choice") {
    const exec = await execFor();
    const opened = await openGameChoice(exec, {
      playerId: sp.id,
      context: {
        origin: how.origin,
        replacedRollId: how.replacedRollId,
        itemKey: how.item?.key ?? null,
        names: how.item?.names ?? null,
        games: next.games.map(gameOffer),
      },
    });
    await recordPool(exec, { playerId: sp.id, shape: next.shape, to: { decisionId: opened.id, offered: next.games.map((g) => g.id) }, relaxed: next.relaxed });
    return { rollId: null, game: null, returned: false, choice: { decisionId: opened.id, offered: next.games.length } };
  }
  const created = await createRoll(sp.id, next.game.id, tx);
  // What shaped the pick is journaled with the roll it went to.
  if (next.shape.firings.length > 0) {
    await recordPool(await execFor(), {
      playerId: sp.id,
      shape: next.shape,
      to: { rollId: created.id, gameId: next.game.id, favoured: next.favoured },
      relaxed: next.relaxed,
    });
  }
  await assign(created.id);
  return { rollId: created.id, game: next.game, returned: false, choice: null };
}

/**
 * Ends the game in flight as rerolled — set aside until the holder's roll
 * counter reaches `postponedUntilSeq`, when it is set aside (spec §6.16) —
 * inside the caller's transaction, and the completion conditions it holds
 * with it (§6.17). False when it had ended already.
 */
export async function endGameInFlight(
  tx: Tx,
  sp: SeasonPlayer,
  config: SeasonConfig,
  rollId: string,
  postponedUntilSeq: number | null,
): Promise<boolean> {
  if (!(await endRollInFlight(tx, rollId, postponedUntilSeq))) return false;
  const registry = config.iee.enabled ? await getSeasonRegistry(sp.seasonId) : null;
  if (registry && givesConditions(registry)) {
    const exec = await executionContext({ tx, seasonId: sp.seasonId, config: config.iee, registry, actorPlayerId: sp.id });
    await endRollConditions(exec, { rollId, playerId: sp.id });
  }
  return true;
}

/**
 * A game is the participant's now (spec §6.17, §7.12 step 6): their rules at
 * `onRollCreated` give its roll its completion conditions. The roll is their
 * next one — what was granted while the game it replaces was in flight sits
 * it out.
 */
export async function gameAssigned(exec: Parameters<typeof addRollConditions>[0], sp: Pick<SeasonPlayer, "id" | "rollSeq">, rollId: string) {
  return addRollConditions(exec, { playerId: sp.id, rollId, rollSeq: sp.rollSeq + 1 });
}

/** The feed's word on a pick that replaced a game (§7.12): the new game, one come back, or the choice opened. */
export function replacementPayload(started: StartedGame): Record<string, unknown> {
  return {
    newGameId: started.game?.id ?? null,
    title: started.game?.title ?? null,
    ...(started.returned ? { returned: true } : {}),
    ...(started.choice ? { choosing: started.choice.offered } : {}),
  };
}
