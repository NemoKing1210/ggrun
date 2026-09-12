import { eq } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import { completionRequests, eventLog, gameRolls, seasonPlayers } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getCompletionRequestById } from "@/lib/modules/catalog/repository";
import type { RollOutcome } from "@/lib/engine";
import { GameLoopError } from "../service/errors";
import { parseSeasonConfig, requireStaffActor } from "../service/helpers";
import { applyResolvedTurn } from "../service/turn";

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
  // The three player-facing paths all refuse a season that is not running; the
  // two approval paths did not, so a request filed while a season was active
  // could be approved after it was finished or archived — writing moves and
  // ledger entries onto a closed run.
  if (season.status !== "active") throw new GameLoopError("gameSeasonNotActive");
  if (sp.status !== "active") throw new GameLoopError("gamePlayerNotActive");

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
  // transaction, because an approved request whose move did not land — or a
  // move whose request stayed pending — would each be worse than failing.
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
