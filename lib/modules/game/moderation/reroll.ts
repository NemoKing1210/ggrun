import { eq } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import { eventLog, gameRolls, gamesCatalog, rerollRequests, seasonPlayers } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { countRerollsForGame, getRerollRequestById, pickGameForRoll, POOL_EMPTY_ERROR } from "@/lib/modules/catalog/repository";
import { canReroll } from "@/lib/engine";
import { GameLoopError } from "../service/errors";
import { parseSeasonConfig, requireStaffActor } from "../service/helpers";
import { notifyUser } from "@/lib/modules/notifications/service";
import { log } from "@/lib/infrastructure/logger";

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
  // Staff verdicts apply whenever the request was filed — including after the
  // season (or the participant) stopped being active. A late approval writes
  // onto a closed run by design; that is the judge's call, and the trail
  // (resolvedBy + event log) records who made it. Only player-facing paths
  // refuse a season that is not running.

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
  await notifyUser(sp.playerId, "reroll_approved", {
    seasonId: sp.seasonId,
    seasonSlug: season.slug,
    seasonTitle: season.title,
    seasonPlayerId: sp.id,
    gameId: game.id,
    gameTitle: game.title,
    imageUrl: game.coverUrl,
    rollId: roll.id,
    requestId: req.id,
  }).catch((error) => log.error("notifications.reroll_approved.failed", { requestId, err: error instanceof Error ? error : undefined }));
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
  const rollRow = (await db.select().from(gameRolls).where(eq(gameRolls.id, req.gameRollId)).limit(1))[0];
  await db.insert(eventLog).values({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "reroll_rejected",
    payload: {
      gameId: rollRow?.gameId ?? null,
      reason,
      requestId: req.id,
    },
  });
  const season = await getSeasonById(sp.seasonId);
  const catalogRow = rollRow?.gameId
    ? (await db.select().from(gamesCatalog).where(eq(gamesCatalog.id, rollRow.gameId)).limit(1))[0]
    : undefined;
  await notifyUser(sp.playerId, "reroll_rejected", {
    seasonId: sp.seasonId,
    seasonSlug: season?.slug ?? null,
    seasonTitle: season?.title ?? "",
    seasonPlayerId: sp.id,
    gameId: rollRow?.gameId ?? null,
    gameTitle: catalogRow?.title ?? "",
    imageUrl: catalogRow?.coverUrl ?? null,
    rollId: req.gameRollId,
    requestId: req.id,
    adminNote: reason,
  }).catch((error) => log.error("notifications.reroll_rejected.failed", { requestId, err: error instanceof Error ? error : undefined }));
}

// --- Admin moderation of completion requests (passed/dropped) ----------------

