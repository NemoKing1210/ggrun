import { db } from "@/lib/infrastructure/db";
import { POOL_EMPTY_ERROR } from "@/lib/modules/catalog/repository";
import { getSeasonPlayerById } from "@/lib/modules/season/repository/players";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { logEvent } from "@/lib/infrastructure/events";
import type { User } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";
import type { DecisionNote } from "@/lib/modules/iee/executor";
import { announceDecisions, hasPendingDecision } from "@/lib/modules/iee/decisions";

import { settleDecisionsBeforeRoll } from "./decisions";
import { GameLoopError } from "./errors";
import { assertActorAllowed, getOpenRollRow, parseSeasonConfig } from "./helpers";
import { pickNextGame, startNextGame } from "./pick";

/**
 * What a roll started: the roll with its game — or, when the player's rules
 * ask for a choice, the choice that waits for them (wave C, spec §7.12).
 */
export type RollStarted = { rollId: string; choice: null } | { rollId: null; choice: { decisionId: string; offered: number } };

export async function rollNewGame(seasonPlayerId: string, opts?: { actor?: User }): Promise<RollStarted> {
  const sp = await getSeasonPlayerById(seasonPlayerId);
  if (!sp) {
    log.debug("game.roll.participant_not_found", { seasonPlayerId });
    throw new GameLoopError("gameParticipantNotFound");
  }
  await assertActorAllowed(sp.id, sp.playerId, opts?.actor);
  const season = await getSeasonById(sp.seasonId);
  if (!season || season.status !== "active") {
    log.debug("game.roll.season_not_active", { seasonId: sp.seasonId, status: season?.status ?? "missing" });
    throw new GameLoopError("gameSeasonNotActive");
  }
  // A run that has ended has ended.
  //
  // `player_status` was display-only on the write path: a participant marked
  // `finished`, `eliminated` or `withdrawn` kept rolling, moving, drawing from
  // the wheel and being targeted, and the dashboard kept offering the button.
  // Now that the board's finish cell actually finishes people, that had to
  // stop meaning nothing.
  if (sp.status !== "active") {
    log.debug("game.roll.player_not_active", { seasonPlayerId: sp.id, status: sp.status });
    throw new GameLoopError("gamePlayerNotActive");
  }

  const open = await getOpenRollRow(sp.id);
  if (open) {
    log.debug("game.roll.already_have_roll", { seasonPlayerId: sp.id, openRollId: open.id });
    throw new GameLoopError("gameAlreadyHaveRoll");
  }
  const config = parseSeasonConfig(season.config);
  // A choice of games waits for the player: they take one, they do not roll again (spec §7.12).
  if (config.iee.enabled && (await hasPendingDecision(sp.id, "game_choice"))) {
    log.debug("game.roll.choosing", { seasonPlayerId: sp.id });
    throw new GameLoopError("ieeDecisionPending");
  }

  // Says *which* nothing. "Add games or check your filters" is the right advice
  // for exactly one of the four ways a pool comes up empty, and the commonest —
  // a participant who has already been handed every game in it — is not that one.
  // A game set aside comes back; otherwise the holder's rules shape the pick (spec §7.12).
  const next = await pickNextGame(sp, config);
  if (next.kind === "none") {
    log.debug("game.roll.no_game_available", { seasonPlayerId: sp.id, reason: next.reason });
    throw new GameLoopError(POOL_EMPTY_ERROR[next.reason]);
  }
  // Starting the next game answers what still waits with its default (spec §7.6).
  await settleDecisionsBeforeRoll(sp, config);
  // The roll, with what shaped its pick — or the choice the player's rules ask for.
  const decisions: DecisionNote[] = [];
  const started = await db.transaction((tx) => startNextGame(tx, sp, config, next, { origin: "roll", replacedRollId: null, item: null, decisions }));
  await announceDecisions(decisions);
  if (started.choice) {
    log.debug("game.roll.choice_opened", { seasonPlayerId: sp.id, decisionId: started.choice.decisionId, offered: started.choice.offered });
    return { rollId: null, choice: started.choice };
  }
  const game = started.game!;
  log.debug("game.roll.chosen", { seasonPlayerId: sp.id, rollId: started.rollId, gameId: game.id, returned: started.returned });
  await logEvent({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "game_rolled",
    payload: { gameId: game.id, title: game.title, ...(started.returned ? { returned: true } : {}) },
  });
  return { rollId: started.rollId!, choice: null };
}
