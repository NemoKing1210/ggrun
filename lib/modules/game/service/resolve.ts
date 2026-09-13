import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { eventLog, gameRolls, seasonPlayers, type User } from "@/db/schema";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import {
  countRerollsForGame,
  createCompletionRequest,
  createRerollRequest,
  getPendingCompletionForRoll,
  getPendingRerollForRoll,
  pickGameForRoll,
  POOL_EMPTY_ERROR,
} from "@/lib/modules/catalog/repository";
import { canReroll, type RollOutcome } from "@/lib/engine";

import { GameLoopError } from "./errors";
import { assertActorAllowed, parseSeasonConfig } from "./helpers";
import { applyResolvedTurn } from "./turn";

export async function resolveGameRoll(
  params: {
    rollId: string;
    outcome: RollOutcome;
    /** Required for dropped (reason) and rerolled (request reason). */
    reason?: string;
    /** Optional for passed — player comment. */
    comment?: string;
    /** Optional for passed — 1-10 rating. */
    rating?: number;
  },
  opts?: { actor?: User },
): Promise<{
  diceResults?: number[];
  fromPosition: number;
  toPosition: number;
  newBalancePoints: number;
  /**
   * What the landing cell's wheel produced, already persisted. The client
   * animates a decision that is finished — a refresh cannot re-spin it.
   */
  wheel?: import("@/lib/engine").WheelOutcome;
}> {
  const actor = opts?.actor ?? (await getCurrentUser());
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
  await assertActorAllowed(sp.id, sp.playerId, actor);

  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  if (season.status !== "active") throw new GameLoopError("gameSeasonNotActive");
  // A run that has ended has ended.
  //
  // `player_status` was display-only on the write path: a participant marked
  // `finished`, `eliminated` or `withdrawn` kept rolling, moving, drawing from
  // the wheel and being targeted, and the dashboard kept offering the button.
  // Now that the board's finish cell actually finishes people, that had to
  // stop meaning nothing.
  if (sp.status !== "active") throw new GameLoopError("gamePlayerNotActive");

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
      // A reroll with nothing to reroll into used to insert a roll row with a
      // null game: the player was left holding an open roll that named no game
      // and could not be resolved, and their reroll count had been spent on it.
      // Refusing costs them nothing and says why.
      const picked = await pickGameForRoll(sp.id);
      if (!picked.game) throw new GameLoopError(POOL_EMPTY_ERROR[picked.reason]);
      const game = picked.game;
      await db.transaction(async (tx) => {
        await tx.update(gameRolls).set({ status: "rerolled", resolvedAt: new Date() }).where(eq(gameRolls.id, roll.id));
        await tx.insert(gameRolls).values({ seasonPlayerId: sp.id, gameId: game.id, status: "rolled" });
        await tx.update(seasonPlayers).set({ rerollsUsed: sp.rerollsUsed + 1 }).where(eq(seasonPlayers.id, sp.id));
        await tx.insert(eventLog).values({
          seasonId: sp.seasonId,
          seasonPlayerId: sp.id,
          eventType: "game_rerolled",
          payload: { oldGameId: roll.gameId, newGameId: game.id, title: game.title, instant: true },
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

  // One turn, one implementation.
  //
  // The judge's approval path (`approveCompletionRequest`) used to carry its own
  // copy of what this call does, written before items and effects existed and
  // never updated: with `moderation.completionRequireApproval` on, no wheel
  // spun, no status fired and `roll_seq` never advanced, which made every
  // item-granted status permanent. A moderation checkbox may change *when* a
  // turn happens; it may not change what a turn is.
  return applyResolvedTurn({
    sp,
    roll,
    outcome: params.outcome,
    notes: notesToSave,
    rating: ratingToSave,
    config,
  });
}
