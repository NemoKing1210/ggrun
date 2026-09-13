import { createRoll, pickGameForRoll, POOL_EMPTY_ERROR } from "@/lib/modules/catalog/repository";
import { getSeasonPlayerById } from "@/lib/modules/season/repository/players";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { logEvent } from "@/lib/infrastructure/events";
import type { User } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";

import { GameLoopError } from "./errors";
import { assertActorAllowed, getOpenRollRow } from "./helpers";

export async function rollNewGame(seasonPlayerId: string, opts?: { actor?: User }): Promise<string> {
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

  // Says *which* nothing. "Add games or check your filters" is the right advice
  // for exactly one of the four ways a pool comes up empty, and the commonest —
  // a participant who has already been handed every game in it — is not that one.
  const { game, reason } = await pickGameForRoll(sp.id);
  if (!game) {
    log.debug("game.roll.no_game_available", { seasonPlayerId: sp.id, reason });
    throw new GameLoopError(POOL_EMPTY_ERROR[reason]);
  }
  const roll = await createRoll(sp.id, game.id);
  log.debug("game.roll.chosen", { seasonPlayerId: sp.id, rollId: roll.id, gameId: game.id });
  await logEvent({ seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: "game_rolled", payload: { gameId: game.id, title: game.title } });
  return roll.id;
}
