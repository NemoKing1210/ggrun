import { eq } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import { completionRequests, eventLog, gameRolls, gamesCatalog, seasonPlayers } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getCompletionRequestById } from "@/lib/modules/catalog/repository";
import type { RollOutcome } from "@/lib/engine";
import { GameLoopError } from "../service/errors";
import { parseSeasonConfig, requireStaffActor } from "../service/helpers";
import { applyResolvedTurn } from "../service/turn";
import { notifyUser } from "@/lib/modules/notifications/service";
import { log } from "@/lib/infrastructure/logger";

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
  // Staff verdicts apply whenever the request was filed — including after the
  // season (or the participant) stopped being active. A late approval writes
  // onto a closed run by design; that is the judge's call, and the trail
  // (resolvedBy + event log) records who made it. Only player-facing paths
  // refuse a season that is not running.

  const config = parseSeasonConfig(season.config);
  const outcome = req.outcome as Exclude<RollOutcome, "rerolled">;

  // The turn itself is not written here.
  //
  // It used to be — a copy of the movement code that predated items and effects
  // and never learned about them. Approving a completion therefore moved the
  // player without a single hook firing, without the landing cell spinning its
  // wheel, without an event cell handing out a challenge, and without advancing
  // `season_players.roll_seq`, which is the clock every `rolls` duration is
  // measured against: a status granted by an item simply never expired. A
  // season with `moderation.completionRequireApproval` on was playing a
  // different game from one without it, and nothing said so.
  //
  // The request row and its feed line are written *inside* the turn's
  await applyResolvedTurn({
    sp,
    roll,
    outcome,
    notes: req.reason,
    rating: req.rating,
    config,
    feedExtra: { approvedBy: actor.id },
    extraWrites: async (tx) => {
      await tx
        .update(completionRequests)
        .set({ status: "approved", resolvedAt: new Date(), resolvedBy: actor.id })
        .where(eq(completionRequests.id, req.id));
    },
    extraEvents: [
      {
        eventType: "completion_approved",
        payload: { requestId: req.id, outcome },
      },
    ],
  });
  const catalogRow = roll.gameId
    ? (await db.select().from(gamesCatalog).where(eq(gamesCatalog.id, roll.gameId)).limit(1))[0]
    : undefined;
  await notifyUser(sp.playerId, "completion_approved", {
    seasonId: sp.seasonId,
    seasonSlug: season.slug,
    seasonTitle: season.title,
    seasonPlayerId: sp.id,
    gameId: roll.gameId,
    gameTitle: catalogRow?.title ?? "",
    imageUrl: catalogRow?.coverUrl ?? null,
    rollId: roll.id,
    requestId: req.id,
    outcome,
  }).catch((error) => log.error("notifications.completion_approved.failed", { requestId, err: error instanceof Error ? error : undefined }));
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
  const rollRow = (await db.select().from(gameRolls).where(eq(gameRolls.id, req.gameRollId)).limit(1))[0];
  await db.insert(eventLog).values({ seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: "completion_rejected", payload: { gameId: rollRow?.gameId ?? null, reason, requestId: req.id, outcome: req.outcome } });
  const season = await getSeasonById(sp.seasonId);
  const catalogRow = rollRow?.gameId
    ? (await db.select().from(gamesCatalog).where(eq(gamesCatalog.id, rollRow.gameId)).limit(1))[0]
    : undefined;
  await notifyUser(sp.playerId, "completion_rejected", {
    seasonId: sp.seasonId,
    seasonSlug: season?.slug ?? null,
    seasonTitle: season?.title ?? "",
    seasonPlayerId: sp.id,
    gameId: rollRow?.gameId ?? null,
    gameTitle: catalogRow?.title ?? "",
    imageUrl: catalogRow?.coverUrl ?? null,
    rollId: req.gameRollId,
    requestId: req.id,
    outcome: req.outcome,
    adminNote: reason,
  }).catch((error) => log.error("notifications.completion_rejected.failed", { requestId, err: error instanceof Error ? error : undefined }));
}

/** The participant's unfinished roll (rolled/in_progress), if any. */
