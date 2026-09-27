import { and, eq } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import { eventLog, gameRolls, rerollRequests, seasonPlayers } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { countRerollsForGame, getRerollRequestById } from "@/lib/modules/catalog/repository";
import { canReroll } from "@/lib/engine";
import { GameLoopError } from "../service/errors";
import { parseSeasonConfig, requireStaffActor } from "../service/helpers";

/**
 * Grants the player a reroll of the roll the request names. It does not draw
 * the new game: the player does, from the dashboard, when they press Reroll
 * (see `resolveGameRoll`). This used to swap the game here, at the judge's
 * click — the player never saw it happen, and the draw used the pool as it was
 * at approval time rather than when they chose to reroll.
 */
export async function approveRerollRequest(requestId: string): Promise<void> {
  const actor = await requireStaffActor();
  const req = await getRerollRequestById(requestId);
  if (!req || req.status !== "pending") throw new GameLoopError("gameRerollRequestNotFound");

  const rollRows = await db.select().from(gameRolls).where(eq(gameRolls.id, req.gameRollId)).limit(1);
  const roll = rollRows[0];
  if (!roll) throw new GameLoopError("gameRollNotFound");
  // Permission for a roll that is no longer open would be permission for nothing.
  if (roll.status !== "rolled" && roll.status !== "in_progress") throw new GameLoopError("gameRollAlreadyResolved");

  const spRows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, req.seasonPlayerId)).limit(1);
  const sp = spRows[0];
  if (!sp) throw new GameLoopError("gameParticipantNotFound");

  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  // Staff verdicts apply whenever the request was filed — including after the
  // season (or the participant) stopped being active. That is the judge's call,
  // and the trail (resolvedBy) records who made it. Using the permission is a
  // player action, and that path refuses a season that is not running.

  // The limits are checked here so a judge cannot approve what the player could
  // never use, and again when the player uses it.
  const config = parseSeasonConfig(season.config);
  if (!config.rerolls.allowed || !canReroll(sp.rerollsUsed, config)) {
    throw new GameLoopError("gameRerollLimit");
  }
  const rerollsThisGame = await countRerollsForGame(sp.id, roll.gameId);
  if (rerollsThisGame >= config.rerolls.limitPerGame) {
    throw new GameLoopError("gameRerollLimitForGame");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(rerollRequests)
      .set({ status: "approved", resolvedAt: new Date(), resolvedBy: actor.id })
      .where(and(eq(rerollRequests.id, req.id), eq(rerollRequests.status, "pending")));
    await tx.insert(eventLog).values({
      seasonId: sp.seasonId,
      seasonPlayerId: sp.id,
      eventType: "reroll_approved",
      payload: { gameId: roll.gameId, requestId: req.id },
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

// --- Admin moderation of completion requests (passed/dropped) ----------------

