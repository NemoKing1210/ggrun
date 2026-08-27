import { and, desc, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { eventLog, gameRolls, gamesCatalog, ledgerEntries, moves, rerollRequests, seasonPlayers } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getBoardCells, getMainBoard, getSeasonById } from "@/lib/repositories/seasons.repo";
import {
  countRerollsForGame,
  createRoll,
  createRerollRequest,
  getPendingRerollForRoll,
  getRerollRequestById,
  rollRandomGame,
  updateRollStatus,
} from "@/lib/repositories/games.repo";
import { getSeasonPlayerById } from "@/lib/repositories/players.repo";
import { logEvent } from "@/lib/repositories/events.repo";
import { log } from "@/lib/log";
import {
  applyCellEffect,
  canReroll,
  DEFAULT_SEASON_CONFIG,
  normalizePosition,
  nextRollStatus,
  resolveMovement,
  SeasonConfigSchema,
  type RollOutcome,
  type SeasonConfig,
} from "@/game-engine";

export class GameLoopError extends Error {
  /**
   * Error code; the text is resolved via the i18n dictionary (t.core.errors) in
   * server actions — the domain knows nothing about UI languages.
   */
  constructor(public readonly code: string) {
    super(code);
  }
}

function parseSeasonConfig(raw: unknown): SeasonConfig {
  const parsed = SeasonConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
}

/** Owner of the season_players row or staff — everyone else is rejected. */
async function assertActorAllowed(
  seasonPlayerId: string,
  playerId: string,
): Promise<void> {
  const actor = await getCurrentUser();
  if (actor && actor.id === playerId) return;
  if (actor && isStaff(actor)) return;
  throw new GameLoopError("gameNotAllowed");
}

/**
 * Rolls a new game for a player. The game is chosen on the server at random
 * from the catalog (no blacklist, no games already played by this participant).
 */
export async function rollNewGame(seasonPlayerId: string): Promise<string> {
  const sp = await getSeasonPlayerById(seasonPlayerId);
  if (!sp) {
    log.debug("game.roll.participant_not_found", { seasonPlayerId });
    throw new GameLoopError("gameParticipantNotFound");
  }
  await assertActorAllowed(sp.id, sp.playerId);

  const season = await getSeasonById(sp.seasonId);
  if (!season || season.status !== "active") {
    log.debug("game.roll.season_not_active", {
      seasonId: sp.seasonId,
      status: season?.status ?? "missing",
    });
    throw new GameLoopError("gameSeasonNotActive");
  }
  const open = await getOpenRollRow(sp.id);
  if (open) {
    log.debug("game.roll.already_have_roll", {
      seasonPlayerId: sp.id,
      openRollId: open.id,
    });
    throw new GameLoopError("gameAlreadyHaveRoll");
  }

  const game = await rollRandomGame(sp.id);
  if (!game) {
    log.debug("game.roll.no_game_available", { seasonPlayerId: sp.id });
    throw new GameLoopError("catalogEmpty");
  }
  const roll = await createRoll(sp.id, game.id);
  log.debug("game.roll.chosen", {
    seasonPlayerId: sp.id,
    rollId: roll.id,
    gameId: game.id,
  });
  await logEvent({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "game_rolled",
    payload: { gameId: game.id, title: game.title },
  });
  return roll.id;
}
/**
 * Resolves a roll by the player: passed / dropped / rerolled (request).
 * - dropped requires `reason` (why the game was not liked)
 * - passed accepts optional `comment` + 1-10 `rating`
 * - rerolled creates a pending reroll request that requires admin approval
 * Random numbers are generated on the server only.
 */
export async function resolveGameRoll(params: {
  rollId: string;
  outcome: RollOutcome;
  /** Required for dropped (reason) and rerolled (request reason). */
  reason?: string;
  /** Optional for passed — player comment. */
  comment?: string;
  /** Optional for passed — 1-10 rating. */
  rating?: number;
}): Promise<{
  diceResults?: number[];
  fromPosition: number;
  toPosition: number;
  newBalancePoints: number;
}> {
  const actor = await getCurrentUser();
  if (!actor) throw new GameLoopError("gameLoginRequired");

  const rollRows = await db
    .select()
    .from(gameRolls)
    .where(eq(gameRolls.id, params.rollId))
    .limit(1);
  const roll = rollRows[0];
  if (!roll) throw new GameLoopError("gameRollNotFound");
  if (
    roll.status === "passed" ||
    roll.status === "dropped" ||
    roll.status === "rerolled"
  ) {
    throw new GameLoopError("gameRollAlreadyResolved");
  }

  const spRows = await db
    .select()
    .from(seasonPlayers)
    .where(eq(seasonPlayers.id, roll.seasonPlayerId))
    .limit(1);
  const sp = spRows[0];
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  await assertActorAllowed(sp.id, sp.playerId);

  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  if (season.status !== "active") throw new GameLoopError("gameSeasonNotActive");

  const config = parseSeasonConfig(season.config);

  // Block concurrent pending reroll requests for this roll.
  const pendingReroll = await getPendingRerollForRoll(roll.id);
  if (pendingReroll) throw new GameLoopError("gameRerollPending");

  // --- rerolled: create a pending request (admin approval required) ----------
  if (params.outcome === "rerolled") {
    const reason = params.reason?.trim() ?? "";
    if (reason.length < 5) throw new GameLoopError("formReasonRequired");
    if (!config.rerolls.allowed || !canReroll(sp.rerollsUsed, config)) {
      throw new GameLoopError("gameRerollLimit");
    }
    const rerollsThisGame = await countRerollsForGame(sp.id, roll.gameId);
    if (rerollsThisGame >= config.rerolls.limitPerGame) {
      throw new GameLoopError("gameRerollLimitForGame");
    }
    await createRerollRequest(sp.id, roll.id, reason);
    await db.insert(eventLog).values({
      seasonId: sp.seasonId,
      seasonPlayerId: sp.id,
      eventType: "reroll_requested",
      payload: { gameId: roll.gameId, reason },
    });
    return {
      fromPosition: sp.position,
      toPosition: sp.position,
      newBalancePoints: sp.balancePoints,
    };
  }

  // --- dropped: reason required --------------------------------------------
  let notesToSave: string | null = null;
  let ratingToSave: number | null = null;
  if (params.outcome === "dropped") {
    const reason = params.reason?.trim() ?? params.comment?.trim() ?? "";
    if (reason.length < 5) throw new GameLoopError("formReasonRequired");
    notesToSave = reason;
  }
  if (params.outcome === "passed") {
    if (params.comment !== undefined) notesToSave = params.comment.trim() || null;
    if (params.rating !== undefined && params.rating !== null) {
      const r = Number(params.rating);
      if (!Number.isInteger(r) || r < 1 || r > 10) throw new GameLoopError("formRatingInvalid");
      ratingToSave = r;
    }
  }

  // The engine FSM requires rolled → in_progress before the outcome: a player
  // marking the result effectively moves the roll to in_progress at that moment.
  const effectiveStatus =
    roll.status === "rolled" ? "in_progress" : roll.status;

  // --- passed / dropped: movement via the pure domain engine ------------------
  const result = resolveMovement({
    currentPosition: sp.position,
    balancePoints: sp.balancePoints,
    outcome: params.outcome,
    streakPass: sp.streakPass,
    streakDrop: sp.streakDrop,
    config,
    rng: Math.random,
  });

  // Landing cell effect (plugin registry in the engine)
  let landedType: string | null = null;
  let finalPosition = result.newPosition;
  let finalBalance = result.newBalancePoints;
  let ledgerDelta = 0;
  let ledgerReason: string | undefined;

  const board = await getMainBoard(sp.seasonId);
  if (board) {
    const cells = await getBoardCells(board.id);
    const landed = cells.find((c) => c.position === finalPosition);
    if (landed) {
      landedType = landed.cellType;
      const effect = applyCellEffect(
        { ...landed, config: (landed.config ?? {}) as Record<string, unknown> },
        finalPosition,
        finalBalance,
      );
      finalPosition = normalizePosition(effect.position, config.board);
      finalBalance = effect.balancePoints;
      ledgerDelta += effect.ledgerDelta;
      if (effect.reason) ledgerReason = effect.reason;
    }
  }

  const newStatus = nextRollStatus(effectiveStatus, params.outcome);

  // fetch game title for feed payload
  let gameTitle: string | null = null;
  if (roll.gameId) {
    const g = await db.select({ title: gamesCatalog.title }).from(gamesCatalog).where(eq(gamesCatalog.id, roll.gameId)).limit(1);
    gameTitle = g[0]?.title ?? null;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(gameRolls)
      .set({
        status: newStatus,
        resolvedAt: new Date(),
        notes: notesToSave,
        rating: ratingToSave,
      })
      .where(eq(gameRolls.id, roll.id));
    const [move] = await tx
      .insert(moves)
      .values({
        seasonPlayerId: sp.id,
        gameRollId: roll.id,
        fromPosition: sp.position,
        toPosition: finalPosition,
        diceResults: result.diceResults,
        cellLandedType: landedType as never,
      })
      .returning({ id: moves.id });
    if (ledgerDelta !== 0 && ledgerReason) {
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: sp.id,
        delta: ledgerDelta,
        reason: ledgerReason,
        relatedMoveId: move!.id,
      });
    }
    await tx
      .update(seasonPlayers)
      .set({
        position: finalPosition,
        balancePoints: finalBalance,
        streakPass: result.newStreakPass,
        streakDrop: result.newStreakDrop,
      })
      .where(eq(seasonPlayers.id, sp.id));
    await tx.insert(eventLog).values([
      {
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: params.outcome === "passed" ? "game_passed" : "game_dropped",
        payload: {
          gameId: roll.gameId,
          title: gameTitle,
          dice: result.diceResults,
          notes: notesToSave,
          rating: ratingToSave,
        },
      },
      {
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: "moved",
        payload: {
          from: sp.position,
          to: finalPosition,
          dice: result.diceResults,
          cellType: landedType,
        },
      },
    ]);
  });
  log.debug("game.resolve.completed", {
    rollId: roll.id,
    outcome: params.outcome,
    to: finalPosition,
    balanceDelta: finalBalance - sp.balancePoints,
  });
  return {
    diceResults: result.diceResults,
    fromPosition: sp.position,
    toPosition: finalPosition,
    newBalancePoints: finalBalance,
  };
}

// --- Admin moderation of reroll requests -----------------------------------

async function requireStaffActor() {
  const actor = await getCurrentUser();
  if (!actor || !isStaff(actor)) throw new GameLoopError("adminStaffRequired");
  return actor;
}

export async function approveRerollRequest(requestId: string): Promise<void> {
  const actor = await requireStaffActor();
  const req = await getRerollRequestById(requestId);
  if (!req || req.status !== "pending") throw new GameLoopError("gameRerollRequestNotFound");

  const rollRows = await db.select().from(gameRolls).where(eq(gameRolls.id, req.gameRollId)).limit(1);
  const roll = rollRows[0];
  if (!roll) throw new GameLoopError("gameRollNotFound");

  const spRows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, req.seasonPlayerId)).limit(1);
  const sp = spRows[0];
  if (!sp) throw new GameLoopError("gameParticipantNotFound");

  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  const config = parseSeasonConfig(season.config);
  if (!config.rerolls.allowed || !canReroll(sp.rerollsUsed, config)) {
    throw new GameLoopError("gameRerollLimit");
  }
  const rerollsThisGame = await countRerollsForGame(sp.id, roll.gameId);
  if (rerollsThisGame >= config.rerolls.limitPerGame) {
    throw new GameLoopError("gameRerollLimitForGame");
  }

  const game = await rollRandomGame(sp.id);
  await db.transaction(async (tx) => {
    await tx.update(gameRolls).set({ status: "rerolled", resolvedAt: new Date() }).where(eq(gameRolls.id, roll.id));
    await tx.insert(gameRolls).values({ seasonPlayerId: sp.id, gameId: game?.id ?? null, status: "rolled" });
    await tx.update(seasonPlayers).set({ rerollsUsed: sp.rerollsUsed + 1 }).where(eq(seasonPlayers.id, sp.id));
    await tx
      .update(rerollRequests)
      .set({ status: "approved", resolvedAt: new Date(), resolvedBy: actor.id })
      .where(eq(rerollRequests.id, req.id));
    await tx.insert(eventLog).values({
      seasonId: sp.seasonId,
      seasonPlayerId: sp.id,
      eventType: "game_rerolled",
      payload: { oldGameId: roll.gameId, newGameId: game?.id ?? null, title: game?.title ?? null, requestId: req.id },
    });
  });
}

export async function rejectRerollRequest(requestId: string, adminNote: string): Promise<void> {
  const actor = await requireStaffActor();
  const reason = adminNote?.trim() ?? "";
  if (reason.length < 5) throw new GameLoopError("formReasonRequired");
  const req = await getRerollRequestById(requestId);
  if (!req || req.status !== "pending") throw new GameLoopError("gameRerollRequestNotFound");

  const spRows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, req.seasonPlayerId)).limit(1);
  const sp = spRows[0];
  if (!sp) throw new GameLoopError("gameParticipantNotFound");

  await db
    .update(rerollRequests)
    .set({ status: "rejected", adminNote: reason, resolvedAt: new Date(), resolvedBy: actor.id })
    .where(eq(rerollRequests.id, req.id));
  await db.insert(eventLog).values({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "reroll_rejected",
    payload: {
      gameId: (await db.select().from(gameRolls).where(eq(gameRolls.id, req.gameRollId)).limit(1))[0]?.gameId ?? null,
      reason,
      requestId: req.id,
    },
  });
}

/** The participant's unfinished roll (rolled/in_progress), if any. */
export async function getOpenRollRow(seasonPlayerId: string) {
  const rows = await db
    .select()
    .from(gameRolls)
    .where(
      and(
        eq(gameRolls.seasonPlayerId, seasonPlayerId),
        or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")),
        isNull(gameRolls.resolvedAt),
      ),
    )
    .orderBy(desc(gameRolls.rolledAt))
    .limit(1);
  return rows[0] ?? null;
}
