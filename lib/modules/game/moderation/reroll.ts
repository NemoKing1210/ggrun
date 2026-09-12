import { eq } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import { eventLog, gameRolls, rerollRequests, seasonPlayers } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { countRerollsForGame, getRerollRequestById, pickGameForRoll, POOL_EMPTY_ERROR } from "@/lib/modules/catalog/repository";
import { canReroll } from "@/lib/engine";
import { GameLoopError } from "../service/errors";
import { parseSeasonConfig, requireStaffActor } from "../service/helpers";

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
  // The three player-facing paths all refuse a season that is not running; the
  // two approval paths did not, so a request filed while a season was active
  // could be approved after it was finished or archived — writing moves and
  // ledger entries onto a closed run.
  if (season.status !== "active") throw new GameLoopError("gameSeasonNotActive");
  if (sp.status !== "active") throw new GameLoopError("gamePlayerNotActive");

  const config = parseSeasonConfig(season.config);
  if (!config.rerolls.allowed || !canReroll(sp.rerollsUsed, config)) {
    throw new GameLoopError("gameRerollLimit");
  }
  const rerollsThisGame = await countRerollsForGame(sp.id, roll.gameId);
  if (rerollsThisGame >= config.rerolls.limitPerGame) {
    throw new GameLoopError("gameRerollLimitForGame");
  }

  // Same as the instant path: no game means no reroll. Throwing leaves the
  // request pending, which is the honest state — the judge can reject it and
  // tell the player why, rather than approving them into an unresolvable roll.
  const { game, reason } = await pickGameForRoll(sp.id);
  if (!game) throw new GameLoopError(POOL_EMPTY_ERROR[reason]);
  await db.transaction(async (tx) => {
    await tx.update(gameRolls).set({ status: "rerolled", resolvedAt: new Date() }).where(eq(gameRolls.id, roll.id));
    await tx.insert(gameRolls).values({ seasonPlayerId: sp.id, gameId: game.id, status: "rolled" });
    await tx.update(seasonPlayers).set({ rerollsUsed: sp.rerollsUsed + 1 }).where(eq(seasonPlayers.id, sp.id));
    await tx
      .update(rerollRequests)
      .set({ status: "approved", resolvedAt: new Date(), resolvedBy: actor.id })
      .where(eq(rerollRequests.id, req.id));
    await tx.insert(eventLog).values({
      seasonId: sp.seasonId,
      seasonPlayerId: sp.id,
      eventType: "game_rerolled",
      payload: { oldGameId: roll.gameId, newGameId: game.id, title: game.title, requestId: req.id },
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

