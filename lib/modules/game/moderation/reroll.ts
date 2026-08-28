import { eq } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import { eventLog, gameRolls, rerollRequests, seasonPlayers } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { countRerollsForGame, getRerollRequestById, rollRandomGame } from "@/lib/modules/catalog/repository";
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

// --- Admin moderation of completion requests (passed/dropped) ----------------

