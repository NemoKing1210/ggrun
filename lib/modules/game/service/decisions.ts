/**
 * Answering the questions a player's entries put to them
 * (docs/IEE_CONSTRUCTOR_SPEC.md §7.6): the player on the dashboard, a judge
 * for them from moderation, or the default as they start their next game.
 *
 * Every answer is one transaction through the executor — its guard is the
 * UPDATE, so a double submit settles nothing twice — and what changed is
 * announced once it has committed: the player's page refreshes, the feed
 * gets its line.
 */
import { db } from "@/lib/infrastructure/db";
import type { IeeDecisionRow, SeasonPlayer, User } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction, logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import type { SeasonConfig, WheelOutcome } from "@/lib/engine";
import type { DecisionChoice } from "@/lib/engine/iee/resolve/decisions";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getSeasonPlayerById } from "@/lib/modules/season/repository/players";
import {
  applyPendingDefaults,
  givesConditions,
  offeredGames,
  resolveDecision,
  settleGameChoice,
  type DecisionNote,
  type ExecContext,
  type IeeFeedEntry,
} from "@/lib/modules/iee/executor";
import { executionContext } from "@/lib/modules/iee/executor/context";
import { announceDecisions, getDecisionRow, listPendingDecisions } from "@/lib/modules/iee/decisions";
import { getSeasonRegistry } from "@/lib/modules/iee/registry";
import { createRoll } from "@/lib/modules/catalog/repository";

import { GameLoopError } from "./errors";
import { getOpenRollRow, parseSeasonConfig } from "./helpers";
import { gameAssigned } from "./pick";
import { answerReactionWindow } from "./turn";

/** What answering played, when it played a turn — a reaction window's (spec §7.4). */
export interface DecisionAnswered {
  /** What the landing cell's wheel produced, already persisted: the client animates it. */
  wheel?: WheelOutcome;
}

/** Writes what an answer did into the public feed, row by row, as the item path does. */
async function publishFeed(sp: SeasonPlayer, feed: readonly IeeFeedEntry[]): Promise<void> {
  for (const row of feed) {
    await logEvent({ seasonId: sp.seasonId, seasonPlayerId: row.seasonPlayerId ?? sp.id, eventType: row.eventType, payload: row.payload });
  }
}

/** One transaction through the executor, then the announcements. */
async function inTransaction(
  sp: SeasonPlayer,
  config: SeasonConfig,
  actorUserId: string | null,
  work: (exec: ExecContext) => Promise<IeeFeedEntry[]>,
): Promise<void> {
  const registry = await getSeasonRegistry(sp.seasonId);
  const decisions: DecisionNote[] = [];
  const feed = await db.transaction(async (tx) => {
    const exec = await executionContext({
      tx,
      seasonId: sp.seasonId,
      config: config.iee,
      registry,
      actorPlayerId: sp.id,
      actorUserId,
      decisions,
    });
    return work(exec);
  });
  await announceDecisions(decisions);
  await publishFeed(sp, feed);
}

/** The decision, its player and their running season — or the error that says why not. */
async function loadForAnswer(decisionId: string): Promise<{ row: IeeDecisionRow; sp: SeasonPlayer; config: SeasonConfig; running: boolean }> {
  const row = await getDecisionRow(decisionId);
  if (!row || row.status !== "pending") throw new GameLoopError(row ? "ieeDecisionSettled" : "ieeDecisionNotFound");
  const sp = await getSeasonPlayerById(row.playerId);
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");
  return { row, sp, config: parseSeasonConfig(season.config), running: season.status === "active" };
}

/** What a turn answered through its window hands back to the screen (§7.4). */
const played = (turn: { wheel?: WheelOutcome }): DecisionAnswered => (turn.wheel ? { wheel: turn.wheel } : {});

/**
 * The player answers their own question (§7.6). Only the player: a judge
 * chooses for them from moderation (`judgeDecision`), which is audited.
 */
export async function answerDecision(
  input: { decisionId: string; option: string; picks?: readonly string[] },
  opts?: { actor?: User | null },
): Promise<DecisionAnswered> {
  const actor = opts?.actor ?? (await getCurrentUser());
  if (!actor) throw new GameLoopError("gameLoginRequired");
  const { row, sp, config, running } = await loadForAnswer(input.decisionId);
  if (sp.playerId !== actor.id) throw new GameLoopError("gameNotAllowed");
  if (!running) throw new GameLoopError("gameSeasonNotActive");
  const choice: DecisionChoice = { option: input.option, ...(input.picks ? { picks: [...input.picks] } : {}) };
  // A choice of games is answered with the game taken: the roll is created with it (wave C, §7.12).
  if (row.kind === "game_choice") {
    if (input.option !== "take" || input.picks?.length !== 1) throw new GameLoopError("ieeDecisionChoiceInvalid");
    await takeGame({ decision: row, sp, config, gameId: input.picks[0]!, userId: actor.id });
    log.info("iee.decision.game_taken", { actorId: actor.id, decisionId: input.decisionId, gameId: input.picks[0] });
    return {};
  }
  // A reaction window holds a turn: answering it plays the turn (§7.4).
  if (row.kind === "reaction_window") {
    const turn = await answerReactionWindow({ decision: row, sp, config, choice, by: "player", userId: actor.id });
    log.info("iee.decision.reacted", { actorId: actor.id, decisionId: input.decisionId, option: input.option });
    return played(turn);
  }
  await inTransaction(sp, config, actor.id, async (exec) => {
    const answered = await resolveDecision(exec, { decisionId: input.decisionId, choice, by: "player", userId: actor.id });
    if (!answered.ok) throw new GameLoopError(answered.code);
    return answered.feed;
  });
  log.info("iee.decision.answered", { actorId: actor.id, decisionId: input.decisionId, option: input.option });
  return {};
}

/**
 * The player takes a game their choice offers (wave C, spec §7.12): the roll
 * is created with it and the choice settled, in one transaction — a game it
 * did not offer, or a second answer, writes nothing. The feed says the game
 * came from a choice.
 */
async function takeGame(input: { decision: IeeDecisionRow; sp: SeasonPlayer; config: SeasonConfig; gameId: string; userId: string }): Promise<void> {
  const { decision, sp, config } = input;
  // While the choice waits there is no open roll (§7.12); one there now is someone else's doing.
  if (await getOpenRollRow(sp.id)) throw new GameLoopError("gameAlreadyHaveRoll");
  const registry = await getSeasonRegistry(sp.seasonId);
  const decisions: DecisionNote[] = [];
  const taken = await db.transaction(async (tx) => {
    const roll = await createRoll(sp.id, input.gameId, tx);
    const exec = await executionContext({ tx, seasonId: sp.seasonId, config: config.iee, registry, actorPlayerId: sp.id, actorUserId: input.userId, decisions });
    const settled = await settleGameChoice(exec, { decisionId: decision.id, gameId: input.gameId, rollId: roll.id, userId: input.userId });
    // The roll goes with the refusal: nothing is written.
    if (!settled.ok) throw new GameLoopError(settled.code);
    // The game is theirs now: their rules give it its completion conditions (§6.17).
    if (givesConditions(registry)) await gameAssigned(exec, sp, roll.id);
    return { rollId: roll.id, game: settled.game };
  });
  await announceDecisions(decisions);
  await logEvent({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "game_rolled",
    payload: { gameId: taken.game.gameId, title: taken.game.title, chosen: true, offered: offeredGames(decision).length },
  });
}

/**
 * The player takes the default of their question, as it stands now (§7.6) —
 * what a bot does at once. Journaled as the player's answer.
 */
export async function answerWithDefault(decisionId: string, opts?: { actor?: User | null }): Promise<DecisionAnswered> {
  const actor = opts?.actor ?? (await getCurrentUser());
  if (!actor) throw new GameLoopError("gameLoginRequired");
  const { row, sp, config, running } = await loadForAnswer(decisionId);
  if (sp.playerId !== actor.id) throw new GameLoopError("gameNotAllowed");
  if (!running) throw new GameLoopError("gameSeasonNotActive");
  // A reaction window's default is to accept the throw (§7.4).
  if (row.kind === "reaction_window") {
    return played(await answerReactionWindow({ decision: row, sp, config, choice: null, by: "player", userId: actor.id }));
  }
  await inTransaction(sp, config, actor.id, async (exec) => {
    const answered = await resolveDecision(exec, { decisionId, choice: null, by: "player", userId: actor.id });
    if (!answered.ok) throw new GameLoopError(answered.code);
    return answered.feed;
  });
  return {};
}

/**
 * A judge chooses for the player (§7.6): an option and its picks, or — with
 * no option — the default as it stands now. Journaled as the judge's, and
 * audited.
 */
export async function judgeDecision(
  input: { decisionId: string; option?: string | null; picks?: readonly string[] },
  opts?: { actor?: User | null },
): Promise<DecisionAnswered> {
  const actor = opts?.actor ?? (await getCurrentUser());
  if (!actor || !isStaff(actor)) throw new GameLoopError("adminStaffRequired");
  const { row, sp, config } = await loadForAnswer(input.decisionId);
  const choice: DecisionChoice | null = input.option
    ? { option: input.option, ...(input.picks ? { picks: [...input.picks] } : {}) }
    : null;
  let answered: DecisionAnswered = {};
  if (row.kind === "reaction_window") {
    // A judge may accept for the player; only the player uses an item (§7.4).
    answered = played(await answerReactionWindow({ decision: row, sp, config, choice, by: "judge", userId: actor.id }));
  } else {
    await inTransaction(sp, config, actor.id, async (exec) => {
      const settled = await resolveDecision(exec, { decisionId: input.decisionId, choice, by: "judge", userId: actor.id });
      if (!settled.ok) throw new GameLoopError(settled.code);
      return settled.feed;
    });
  }
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_decision_judged",
    targetType: "iee_decision",
    targetId: input.decisionId,
    payload: { seasonPlayerId: sp.id, option: input.option ?? "default", picks: input.picks ?? [] },
  });
  log.info("iee.decision.judged", { actorId: actor.id, decisionId: input.decisionId });
  return answered;
}

/**
 * The player starts their next game (§7.6): a victim choice still waiting
 * takes its default, journaled. One read and nothing more when nothing waits.
 */
export async function settleDecisionsBeforeRoll(sp: SeasonPlayer, config: SeasonConfig): Promise<void> {
  if (!config.iee.enabled) return;
  const pending = await listPendingDecisions(sp.id);
  if (!pending.some((row) => row.kind === "victim_choice")) return;
  await inTransaction(sp, config, null, (exec) => applyPendingDefaults(exec, sp.id));
}
