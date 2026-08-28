import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { eventLog, gameRolls, gamesCatalog, ledgerEntries, moves, seasonPlayers } from "@/db/schema";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getBoardCells, getMainBoard, getSeasonById } from "@/lib/modules/season/repository/seasons";
import {
  countRerollsForGame,
  createCompletionRequest,
  createRerollRequest,
  getPendingCompletionForRoll,
  getPendingRerollForRoll,
  rollRandomGame,
} from "@/lib/modules/catalog/repository";
import { log } from "@/lib/infrastructure/logger";
import {
  applyCellEffect,
  canReroll,
  normalizePosition,
  nextRollStatus,
  resolveMovement,
  type RollOutcome,
} from "@/lib/engine";

import { GameLoopError } from "./errors";
import { assertActorAllowed, parseSeasonConfig } from "./helpers";

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

  // Block concurrent pending requests for this roll.
  const pendingReroll = await getPendingRerollForRoll(roll.id);
  if (pendingReroll) throw new GameLoopError("gameRerollPending");
  const pendingCompletion = await getPendingCompletionForRoll(roll.id);
  if (pendingCompletion) throw new GameLoopError("gameCompletionPending");

  const rerollRequireApproval = (config.rerolls as { requireApproval?: boolean }).requireApproval ?? true;
  const completionRequireApproval = (config.moderation as { completionRequireApproval?: boolean })?.completionRequireApproval ?? false;

  // --- rerolled: pending or instant ----------------------------------------
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
    // Instant reroll when season allows without approval
    if (!rerollRequireApproval) {
      const game = await rollRandomGame(sp.id);
      await db.transaction(async (tx) => {
        await tx.update(gameRolls).set({ status: "rerolled", resolvedAt: new Date() }).where(eq(gameRolls.id, roll.id));
        await tx.insert(gameRolls).values({ seasonPlayerId: sp.id, gameId: game?.id ?? null, status: "rolled" });
        await tx.update(seasonPlayers).set({ rerollsUsed: sp.rerollsUsed + 1 }).where(eq(seasonPlayers.id, sp.id));
        await tx.insert(eventLog).values({
          seasonId: sp.seasonId,
          seasonPlayerId: sp.id,
          eventType: "game_rerolled",
          payload: { oldGameId: roll.gameId, newGameId: game?.id ?? null, title: game?.title ?? null, instant: true },
        });
      });
      return {
        fromPosition: sp.position,
        toPosition: sp.position,
        newBalancePoints: sp.balancePoints,
      };
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

  // --- completion moderation: if season requires approval, queue request ------
  if ((params.outcome === "passed" || params.outcome === "dropped") && completionRequireApproval) {
    let reason: string | null = null;
    let rating: number | null = null;
    if (params.outcome === "dropped") {
      const r = params.reason?.trim() ?? params.comment?.trim() ?? "";
      if (r.length < 5) throw new GameLoopError("formReasonRequired");
      reason = r;
    }
    if (params.outcome === "passed") {
      if (params.comment !== undefined) reason = params.comment.trim() || null;
      if (params.rating !== undefined && params.rating !== null) {
        const rr = Number(params.rating);
        if (!Number.isInteger(rr) || rr < 1 || rr > 10) throw new GameLoopError("formRatingInvalid");
        rating = rr;
      }
    }
    await createCompletionRequest(sp.id, roll.id, params.outcome, reason, rating);
    await db.insert(eventLog).values({
      seasonId: sp.seasonId,
      seasonPlayerId: sp.id,
      eventType: "completion_requested",
      payload: { gameId: roll.gameId, outcome: params.outcome, reason, rating },
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
