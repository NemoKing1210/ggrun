import { eq } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import { completionRequests, eventLog, gameRolls, gamesCatalog, ledgerEntries, moves, seasonPlayers } from "@/db/schema";
import { getBoardCells, getMainBoard, getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getCompletionRequestById } from "@/lib/modules/catalog/repository";
import { applyCellEffect, normalizePosition, nextRollStatus, resolveMovement, type RollOutcome } from "@/lib/engine";
import { GameLoopError } from "../service/errors";
import { parseSeasonConfig, requireStaffActor } from "../service/helpers";

export async function approveCompletionRequest(requestId: string): Promise<void> {
  const actor = await requireStaffActor();
  const req = await getCompletionRequestById(requestId);
  if (!req || req.status !== "pending") throw new GameLoopError("gameCompletionRequestNotFound");
  const rollRows = await db.select().from(gameRolls).where(eq(gameRolls.id, req.gameRollId)).limit(1);
  const roll = rollRows[0];
  if (!roll) throw new GameLoopError("gameRollNotFound");
  if (roll.status === "passed" || roll.status === "dropped" || roll.status === "rerolled") throw new GameLoopError("gameRollAlreadyResolved");
  const spRows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, req.seasonPlayerId)).limit(1);
  const sp = spRows[0];
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  const config = parseSeasonConfig(season.config);
  const outcome = req.outcome as RollOutcome;
  // Execute movement exactly as in immediate completion
  const effectiveStatus = roll.status === "rolled" ? "in_progress" : roll.status;
  const result = resolveMovement({
    currentPosition: sp.position,
    balancePoints: sp.balancePoints,
    outcome: outcome as Exclude<RollOutcome, "rerolled">,
    streakPass: sp.streakPass,
    streakDrop: sp.streakDrop,
    config,
    rng: Math.random,
  });
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
      const effect = applyCellEffect({ ...landed, config: (landed.config ?? {}) as Record<string, unknown> }, finalPosition, finalBalance);
      finalPosition = normalizePosition(effect.position, config.board);
      finalBalance = effect.balancePoints;
      ledgerDelta += effect.ledgerDelta;
      if (effect.reason) ledgerReason = effect.reason;
    }
  }
  const newStatus = nextRollStatus(effectiveStatus, outcome);
  let gameTitle: string | null = null;
  if (roll.gameId) {
    const g = await db.select({ title: gamesCatalog.title }).from(gamesCatalog).where(eq(gamesCatalog.id, roll.gameId)).limit(1);
    gameTitle = g[0]?.title ?? null;
  }
  await db.transaction(async (tx) => {
    await tx.update(gameRolls).set({ status: newStatus, resolvedAt: new Date(), notes: req.reason, rating: req.rating }).where(eq(gameRolls.id, roll.id));
    const [move] = await tx.insert(moves).values({ seasonPlayerId: sp.id, gameRollId: roll.id, fromPosition: sp.position, toPosition: finalPosition, diceResults: result.diceResults, cellLandedType: landedType as never }).returning({ id: moves.id });
    if (ledgerDelta !== 0 && ledgerReason) {
      await tx.insert(ledgerEntries).values({ seasonPlayerId: sp.id, delta: ledgerDelta, reason: ledgerReason, relatedMoveId: move!.id });
    }
    await tx.update(seasonPlayers).set({ position: finalPosition, balancePoints: finalBalance, streakPass: result.newStreakPass, streakDrop: result.newStreakDrop }).where(eq(seasonPlayers.id, sp.id));
    await tx.update(completionRequests).set({ status: "approved", resolvedAt: new Date(), resolvedBy: actor.id }).where(eq(completionRequests.id, req.id));
    await tx.insert(eventLog).values([
      { seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: outcome === "passed" ? "game_passed" : "game_dropped", payload: { gameId: roll.gameId, title: gameTitle, dice: result.diceResults, notes: req.reason, rating: req.rating, approvedBy: actor.id } },
      { seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: "moved", payload: { from: sp.position, to: finalPosition, dice: result.diceResults, cellType: landedType } },
      { seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: "completion_approved", payload: { requestId: req.id, outcome } },
    ]);
  });
}

export async function rejectCompletionRequest(requestId: string, adminNote: string): Promise<void> {
  const actor = await requireStaffActor();
  const reason = adminNote?.trim() ?? "";
  if (reason.length < 5) throw new GameLoopError("formReasonRequired");
  const req = await getCompletionRequestById(requestId);
  if (!req || req.status !== "pending") throw new GameLoopError("gameCompletionRequestNotFound");
  const spRows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, req.seasonPlayerId)).limit(1);
  const sp = spRows[0];
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  await db.update(completionRequests).set({ status: "rejected", adminNote: reason, resolvedAt: new Date(), resolvedBy: actor.id }).where(eq(completionRequests.id, req.id));
  await db.insert(eventLog).values({ seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: "completion_rejected", payload: { gameId: (await db.select().from(gameRolls).where(eq(gameRolls.id, req.gameRollId)).limit(1))[0]?.gameId ?? null, reason, requestId: req.id, outcome: req.outcome } });
}

/** The participant's unfinished roll (rolled/in_progress), if any. */
