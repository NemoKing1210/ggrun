import { createRoll, rollRandomGame } from "@/lib/modules/catalog/repository";
import { getSeasonPlayerById } from "@/lib/modules/season/repository/players";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";

import { GameLoopError } from "./errors";
import { assertActorAllowed, getOpenRollRow } from "./helpers";

export async function rollNewGame(seasonPlayerId: string): Promise<string> {
  const sp = await getSeasonPlayerById(seasonPlayerId);
  if (!sp) {
    log.debug("game.roll.participant_not_found", { seasonPlayerId });
    throw new GameLoopError("gameParticipantNotFound");
  }
  await assertActorAllowed(sp.id, sp.playerId);

  const season = await getSeasonById(sp.seasonId);
  if (!season || season.status !== "active") {
    log.debug("game.roll.season_not_active", { seasonId: sp.seasonId, status: season?.status ?? "missing" });
    throw new GameLoopError("gameSeasonNotActive");
  }
  const open = await getOpenRollRow(sp.id);
  if (open) {
    log.debug("game.roll.already_have_roll", { seasonPlayerId: sp.id, openRollId: open.id });
    throw new GameLoopError("gameAlreadyHaveRoll");
  }

  const game = await rollRandomGame(sp.id);
  if (!game) {
    log.debug("game.roll.no_game_available", { seasonPlayerId: sp.id });
    throw new GameLoopError("catalogEmpty");
  }
  const roll = await createRoll(sp.id, game.id);
  log.debug("game.roll.chosen", { seasonPlayerId: sp.id, rollId: roll.id, gameId: game.id });
  await logEvent({ seasonId: sp.seasonId, seasonPlayerId: sp.id, eventType: "game_rolled", payload: { gameId: game.id, title: game.title } });
  return roll.id;
}
