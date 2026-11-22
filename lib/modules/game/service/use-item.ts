/**
 * Activating an item from the inventory.
 *
 * Named "activate" rather than "use" on purpose: a server function whose name
 * begins with `use` trips React's rules-of-hooks lint.
 *
 * Two things matter here above all else:
 *  - the charge is spent by a guarded UPDATE, so a double-submitted form spends
 *    exactly one (§15.6 step 4);
 *  - `target` is enforced on the server, never merely hidden in the UI.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { gamesCatalog, seasonPlayers, users, type SeasonPlayer, type User } from "@/db/schema";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getInstanceRow, getMoveCount, listActiveInstances, listActiveObjects } from "@/lib/modules/iee/repository";
import type { DecisionNote } from "@/lib/modules/iee/executor";
import type { Tx } from "@/lib/modules/iee/executor/store";
import { executionContext } from "@/lib/modules/iee/executor/context";
import { announceDecisions, hasPendingDecision } from "@/lib/modules/iee/decisions";
import { getSeasonRegistry } from "@/lib/modules/iee/registry";
import { carryOutItemUse, decideItemUse } from "@/lib/modules/iee/use";
import type { GameIntent, IeePlayerSnapshot, PickRequest, SeasonConfig, Standing } from "@/lib/engine";
import type { CompiledItem } from "@/lib/engine/iee/dsl";
import {
  getPendingCompletionForRoll,
  getPendingRerollForRoll,
  offeredPick,
  pickGames,
  POOL_EMPTY_ERROR,
} from "@/lib/modules/catalog/repository";

import { GameLoopError } from "./errors";
import { getOpenRollRow, parseSeasonConfig } from "./helpers";
import { offeredCell, ownedObjects } from "./objects";
import { endGameInFlight, pickNextGame, replacementPayload, startNextGame, type NextGame } from "./pick";

/** Read-only projection the entry's rules receive. */
async function snapshot(sp: SeasonPlayer): Promise<IeePlayerSnapshot> {
  return {
    seasonPlayerId: sp.id,
    position: sp.position,
    balancePoints: sp.balancePoints,
    rollSeq: sp.rollSeq,
    moveCount: await getMoveCount(sp.id),
    rank: 1,
    status: sp.status,
  };
}

/** Where the season's participants stand — what a target filter reads (spec §6.10). */
async function seasonStandings(seasonId: string): Promise<Standing[]> {
  return db
    .select({ seasonPlayerId: seasonPlayers.id, position: seasonPlayers.position, status: seasonPlayers.status })
    .from(seasonPlayers)
    .where(eq(seasonPlayers.seasonId, seasonId));
}

/**
 * What the form picked for the next game (wave C, spec §6.16): the first of a
 * genre, a decade — "1990", "1990-1999" — or a game that it sent; or the cell
 * an item places itself on (wave D, §6.18); null for none.
 */
export function pickRequestOf(fields: {
  pickedGenre?: string | null;
  pickedYears?: string | null;
  pickedGameId?: string | null;
  pickedCell?: string | null;
}): PickRequest | null {
  const cell = fields.pickedCell?.trim();
  if (cell && /^\d{1,3}$/.test(cell)) return { cell: Number(cell) };
  const genre = fields.pickedGenre?.trim().toLowerCase();
  if (genre) return { genre };
  const years = fields.pickedYears?.trim().match(/^(\d{4})(?:\s*[-–]\s*(\d{4}))?$/);
  if (years) {
    const from = Number(years[1]);
    return { years: [from, years[2] ? Number(years[2]) : from + 9] };
  }
  const gameId = fields.pickedGameId?.trim();
  return gameId ? { gameId } : null;
}

async function getSeasonPlayer(id: string): Promise<SeasonPlayer | null> {
  const rows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Games of the season's pool the holder of an item that asks for a game may
 * pick (wave C, spec §6.16), by title — what the dashboard's picker searches.
 * Only the holder asks; an item that asks for no game offers none. The use
 * checks the pick again: this only lists what may be picked.
 */
export async function searchPickGames(
  inventoryId: string,
  query: string,
  opts?: { actor?: User | null },
): Promise<{ id: string; title: string }[]> {
  const actor = opts?.actor ?? (await getCurrentUser());
  if (!actor) throw new GameLoopError("gameLoginRequired");
  const row = await getInstanceRow(inventoryId);
  if (!row || row.kind !== "item" || !row.holderPlayerId || row.status !== "active") throw new GameLoopError("ieeItemNotFound");
  const sp = await getSeasonPlayer(row.holderPlayerId);
  if (!sp || sp.playerId !== actor.id) throw new GameLoopError("gameNotAllowed");
  const registry = await getSeasonRegistry(sp.seasonId);
  if (registry.item(row.revisionId)?.usage.pick !== "game") return [];
  return pickGames(sp.id, query.trim().slice(0, 80), 30);
}

/** The game in flight an item replaces or sets aside, and what comes instead — read before anything is spent. */
interface Replacement {
  open: { id: string; gameId: string | null };
  title: string | null;
  next: Exclude<NextGame, { kind: "none" }>;
}

/**
 * What an item used on an open roll needs before it is spent (wave C, spec
 * §6.16): the game in flight — with no judge looking at it, a completion or a
 * reroll waiting — and the next game, picked as any pick is (§7.12). Refuses,
 * spending nothing, when the pool has no game to pick.
 */
async function prepareReplacement(sp: SeasonPlayer, config: SeasonConfig): Promise<Replacement> {
  const open = await getOpenRollRow(sp.id);
  if (!open) throw new GameLoopError("ieeItemWrongWindow");
  if (await getPendingRerollForRoll(open.id)) throw new GameLoopError("gameRerollPending");
  if (await getPendingCompletionForRoll(open.id)) throw new GameLoopError("gameCompletionPending");
  const next = await pickNextGame(sp, config);
  if (next.kind === "none") throw new GameLoopError(POOL_EMPTY_ERROR[next.reason]);
  const game = open.gameId ? (await db.select({ title: gamesCatalog.title }).from(gamesCatalog).where(eq(gamesCatalog.id, open.gameId)).limit(1))[0] : undefined;
  return { open: { id: open.id, gameId: open.gameId }, title: game?.title ?? null, next };
}

/**
 * Replaces the game in flight, or sets it aside, inside the use's transaction
 * (spec §6.16): the roll ends as rerolled — set aside until the holder's roll
 * counter reaches the pick it comes back on — and the next game starts. The
 * season's rerolls are not spent: the item is the permission. Returns the
 * feed row it makes: `game_rerolled` naming the item, or `game_postponed`.
 */
async function replaceGame(
  tx: Tx,
  input: { sp: SeasonPlayer; config: SeasonConfig; intent: GameIntent; prepared: Replacement; item: CompiledItem; decisions: DecisionNote[] },
): Promise<{ eventType: "game_rerolled" | "game_postponed"; payload: Record<string, unknown> }> {
  const { sp, intent, prepared, item } = input;
  const afterRolls = intent.how === "postpone" ? (intent.afterRolls ?? 2) : null;
  // With 2, the game picked now is new and the one after it is the set-aside game.
  const until = afterRolls === null ? null : sp.rollSeq + afterRolls - 1;
  if (!(await endGameInFlight(tx, sp, input.config, prepared.open.id, until))) throw new GameLoopError("gameRollAlreadyResolved");
  const started = await startNextGame(tx, sp, input.config, prepared.next, {
    origin: intent.how === "postpone" ? "postpone" : "reroll",
    replacedRollId: prepared.open.id,
    item: { key: item.key, names: item.names },
    decisions: input.decisions,
  });
  const named = { itemKey: item.key, name: item.names };
  if (afterRolls !== null && until !== null) {
    return {
      eventType: "game_postponed",
      payload: {
        gameId: prepared.open.gameId,
        title: prepared.title,
        afterRolls,
        // The holder's roll number it comes back on: their counter then, plus one.
        comesBackOn: until + 1,
        ...named,
        newGameId: started.game?.id ?? null,
        newTitle: started.game?.title ?? null,
        ...(started.returned ? { returned: true } : {}),
        ...(started.choice ? { choosing: started.choice.offered } : {}),
      },
    };
  }
  return { eventType: "game_rerolled", payload: { oldGameId: prepared.open.gameId, ...replacementPayload(started), ...named } };
}

export async function activateInventoryItem(
  params: {
    /** The item instance — still named after the form field that carries it. */
    inventoryId: string;
    targetSeasonPlayerId?: string | null;
    /** The holder's own instance picked for an item that asks for one (spec §6.10). */
    choiceInstanceId?: string | null;
    /** The entry of the season's catalog picked for an item that asks for one (spec §6.12). */
    chosenEntryId?: string | null;
    /** What was picked for the next game, for an item that asks (wave C, spec §6.16): a genre… */
    pickedGenre?: string | null;
    /** …a decade of release years — "1990" or "1990-1999"… */
    pickedYears?: string | null;
    /** …or a game of the season's pool. */
    pickedGameId?: string | null;
    /** The cell an item places itself on (wave D, spec §6.18). */
    pickedCell?: string | null;
  },
  /**
   * Explicit actor for request-less callers (the bot ticker), mirroring
   * `rollNewGame(spId, { actor })`. Inside a request it defaults to the cookie
   * session. The holder-only rule still applies: a caller may act as the
   * holder, never on their behalf.
   */
  opts?: { actor?: User | null },
): Promise<{ itemKey: string; targetUsername: string | null }> {
  const actor = opts?.actor ?? (await getCurrentUser());
  if (!actor) throw new GameLoopError("gameLoginRequired");

  const row = await getInstanceRow(params.inventoryId);
  if (!row || row.kind !== "item" || !row.holderPlayerId) throw new GameLoopError("ieeItemNotFound");
  // A passive item without charges has none to spend — the guards refuse it as unusable below.
  if (row.status !== "active" || (row.chargesLeft !== null && row.chargesLeft <= 0)) {
    throw new GameLoopError("ieeItemAlreadyUsed");
  }

  const sp = await getSeasonPlayer(row.holderPlayerId);
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  // Only the holder uses their own item — staff included. A judge who needs to
  // intervene revokes or grants, which is audited; they do not play for people.
  if (sp.playerId !== actor.id) throw new GameLoopError("gameNotAllowed");

  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  if (season.status !== "active") throw new GameLoopError("gameSeasonNotActive");
  const config = parseSeasonConfig(season.config);

  const registry = await getSeasonRegistry(sp.seasonId);
  const def = registry.item(row.revisionId);
  if (!def) throw new GameLoopError("ieeItemNotFound");

  // Resolve the candidate the form named; the rules themselves are pure.
  const wanted = params.targetSeasonPlayerId?.trim() || null;
  const candidate = wanted ? await getSeasonPlayer(wanted) : null;
  const actorSnapshot = await snapshot(sp);
  const candidateSnapshot = candidate ? await snapshot(candidate) : null;

  // --- the guards and the entry decide what happens; nothing is written yet ---
  // A `unique` status already on its recipient refuses the use here, before
  // the charge is spent.
  const decided = await decideItemUse({
    registry,
    item: def,
    params: (row.params ?? {}) as Record<string, string | number | boolean>,
    hasOpenRoll: Boolean(await getOpenRollRow(sp.id)),
    actor: actorSnapshot,
    candidate: candidateSnapshot,
    targetInSameSeason: candidate ? candidate.seasonId === sp.seasonId : true,
    allowTargetingOthers: config.iee.allowTargetingOthers,
    pvpProtectionMoves: config.iee.pvpProtectionMoves,
    rowsOf: (id) => listActiveInstances(id),
    rng: Math.random,
    choice: params.choiceInstanceId?.trim() || null,
    entryChoice: params.chosenEntryId?.trim() || null,
    pick: pickRequestOf(params),
    // A cell is the board's to offer (wave D, §6.18); anything else, the season's pool's (§6.16).
    offeredPick: (wanted) => ("cell" in wanted ? offeredCell(sp.seasonId, wanted.cell) : offeredPick(sp.id, wanted)),
    ...(def.usage.pick === "cell"
      ? { objects: { owned: ownedObjects(await listActiveObjects(sp.seasonId), sp.id), limit: config.iee.boardObjectsPerPlayer } }
      : {}),
    instanceId: row.id,
    // A question waiting for the user is answered first (§7.6).
    decisionPending: await hasPendingDecision(sp.id),
    // A rival choosing a reaction to their dice is out of reach meanwhile (§7.4).
    targetReacting: candidate && candidate.id !== sp.id ? await hasPendingDecision(candidate.id, "reaction_window") : false,
    // A target filter judges where everyone stands now; read only when it needs to.
    ...(def.usage.filter ? { standings: await seasonStandings(sp.seasonId) } : {}),
  });
  if (!decided.ok) throw new GameLoopError(decided.code);
  const { outcome } = decided;
  const target: SeasonPlayer | null =
    decided.target === null ? null : decided.target.seasonPlayerId === sp.id ? sp : candidate;

  // The game in flight (wave C, spec §6.16): replaced, or set aside — picked
  // before anything is spent, so a pool with nothing to offer refuses the use.
  const gameIntent = outcome.intents.find((i): i is GameIntent => i.kind === "game") ?? null;
  const replacing = gameIntent ? await prepareReplacement(sp, config) : null;

  const targetUsername = target
    ? ((
        await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, target.playerId))
          .limit(1)
      )[0]?.username ?? null)
    : null;

  // A use may ask someone to choose (§7.6): announced once it commits.
  const decisions: DecisionNote[] = [];
  const { feed, gameFeed } = await db.transaction(async (tx) => {
    const exec = await executionContext({
      tx,
      seasonId: sp.seasonId,
      config: config.iee,
      registry,
      actorPlayerId: sp.id,
      actorUserId: actor.id,
      decisions,
    });
    // The guard is the UPDATE's WHERE clause: a second submit matches nothing.
    const used = await carryOutItemUse(exec, { instanceId: row.id, holder: sp.id, target: target?.id ?? null, outcome });
    if (!used) throw new GameLoopError("ieeItemAlreadyUsed");
    const replaced = gameIntent && replacing ? await replaceGame(tx, { sp, config, intent: gameIntent, prepared: replacing, item: def, decisions }) : null;
    return { feed: used.feed, gameFeed: replaced };
  });

  await announceDecisions(decisions);
  // Always public: this is both the requested log and the deterrent (§8.3).
  await logEvent({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "item_used",
    payload: {
      ...outcome.feedPayload,
      itemKey: def.key,
      name: def.names,
      targetSeasonPlayerId: target?.id ?? null,
      targetUsername,
    },
  });
  // The game it replaced or set aside, and what came instead (§7.12).
  if (gameFeed) await logEvent({ seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: gameFeed.eventType, payload: gameFeed.payload });
  // What the use did in plain sight — a player moved out of turn — follows the use.
  for (const row of feed) {
    await logEvent({
      seasonId: sp.seasonId,
      seasonPlayerId: row.seasonPlayerId ?? sp.id,
      eventType: row.eventType,
      payload: row.payload,
    });
  }
  log.info("iee.item.used", {
    actorId: actor.id,
    itemKey: def.key,
    targetSeasonPlayerId: target?.id ?? null,
  });

  return { itemKey: def.key, targetUsername };
}
