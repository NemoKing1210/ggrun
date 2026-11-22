import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import {
  eventLog,
  gameRolls,
  gamesCatalog,
  ledgerEntries,
  moves,
  seasonPlayers,
  type GameRoll,
  type IeeDecisionRow,
  type IeeInstanceRow,
  type SeasonPlayer,
} from "@/db/schema";
import { getBoardCells, getMainBoard } from "@/lib/modules/season/repository/seasons";
import { log } from "@/lib/infrastructure/logger";
import {
  nextRollStatus,
  playTurn,
  type IeeLocaleText,
  type IeePlayerSnapshot,
  type PlayedTurn,
  type ReactionRules,
  type ReactionView,
  type RollOutcome,
  type SeasonConfig,
  type TurnCell,
  type WheelOutcome,
} from "@/lib/engine";
import type { DecisionChoice, DecisionOption } from "@/lib/engine/iee/resolve/decisions";

import * as executor from "@/lib/modules/iee/executor";
import {
  endRollConditions,
  givesConditions,
  openReactionWindow,
  settleReactionWindow,
  type DecisionNote,
  type ExecContext,
} from "@/lib/modules/iee/executor";
import { executionContext } from "@/lib/modules/iee/executor/context";
import { announceDecisions, hasPendingDecision } from "@/lib/modules/iee/decisions";
import { getSeasonRegistry, type SeasonRegistry } from "@/lib/modules/iee/registry";
import { listActiveInstances, listActiveObjects, toPlayerSnapshot } from "@/lib/modules/iee/repository";
import {
  diceRulesOf,
  holdsReactionItem,
  mayReact,
  reactionOffers,
  recorder,
  replayer,
  type ReactionContext,
  type ReactionOffer,
} from "@/lib/modules/iee/turn";

import { GameLoopError } from "./errors";
import { assignEventFromCell } from "./events";
import {
  applyWheels,
  loadTurnHooks,
  loadWheelContext,
  settleTurnHooks,
  type FeedEntry,
  type TurnHooks,
} from "./iee";

/**
 * Everything that happens once a roll's outcome is decided.
 *
 * This lives in a file of its own because there are two ways to reach it — the
 * player marking the outcome, and a judge approving the request the player
 * filed when the season requires approval — and for a long while those were two
 * different pieces of code. The approval path was written before items and
 * effects existed and never learned about them, so switching
 * `moderation.completionRequireApproval` on silently turned the entire
 * subsystem off: no wheel spun, no status fired, no ward absorbed, no
 * challenge was assigned, no charge was spent and nothing ever expired. Worse,
 * that path never advanced `season_players.roll_seq` — the clock every `rolls`
 * duration is measured against — so a status handed out by an item or a
 * challenge reward stayed on its victim for the rest of the season.
 *
 * A season-wide behaviour switch hiding behind a moderation checkbox is not a
 * configuration; it is a second game. So: one turn, one implementation, two
 * callers.
 *
 * The two seams below (`extraWrites`, `extraEvents`) exist so the approval path
 * can mark its own request row and post its own feed line **inside this
 * transaction** rather than around it — an approved request whose move did not
 * land, or a move whose request stayed pending, would each be worse than either
 * failing.
 *
 * A turn may pause (wave B, the reaction window, spec §7.4): when the throw
 * offers the player a reaction item, reporting the game opens the window and
 * writes nothing else — the approval's seams included, which then belong to
 * the window — and answering it plays the turn again on the draws the window
 * kept and writes it (`answerReactionWindow`).
 */
export interface ResolvedTurnInput {
  sp: SeasonPlayer;
  roll: GameRoll;
  /** Never "rerolled" — a reroll does not resolve a turn. */
  outcome: Exclude<RollOutcome, "rerolled">;
  /** Player's comment, or the required reason for a drop. */
  notes: string | null;
  /** 1-10, passes only. */
  rating: number | null;
  config: SeasonConfig;
  /**
   * Extra writes for this same transaction, run before the feed batch — or, when
   * the turn pauses for a reaction window, with the window (no move yet: `moveId` null).
   */
  extraWrites?: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    ctx: { moveId: string | null },
  ) => Promise<void>;
  /** Extra feed rows, appended to the batch. */
  extraEvents?: FeedEntry[];
  /** Merged into the `game_passed` / `game_dropped` payload. */
  feedExtra?: Record<string, unknown>;
}

export interface ResolvedTurnResult {
  diceResults: number[];
  fromPosition: number;
  toPosition: number;
  newBalancePoints: number;
  /**
   * What the landing cell's wheel produced, already persisted. The client
   * animates a decision that is finished — a refresh cannot re-spin it.
   */
  wheel?: WheelOutcome;
  /**
   * The turn paused for the player's reaction (wave B, spec §7.4): the window
   * and the faces it shows. Nothing moved; answering it plays the turn.
   */
  reaction?: { decisionId: string; faces: number[] };
}

/** What a turn reads before it plays: the season's registry and the board. */
interface TurnSetting {
  registry: SeasonRegistry;
  cells: Awaited<ReturnType<typeof getBoardCells>>;
  cellAt: (position: number) => TurnCell | null;
  /**
   * The roll being resolved. Computed once and used for every clock in this
   * turn — the `participates()` filter inside `runLiveHook` (via
   * `turnBase.rollSeq`), the `onTick` context and the counters ticked at the
   * end. They used to disagree by one, which is exactly how a one-roll status
   * outlived its roll.
   */
  turnRollSeq: number;
}

async function turnSetting(sp: SeasonPlayer): Promise<TurnSetting> {
  const registry = await getSeasonRegistry(sp.seasonId);
  const board = await getMainBoard(sp.seasonId);
  const cells = board ? await getBoardCells(board.id) : [];
  const cellAt = (position: number): TurnCell | null => {
    const cell = cells.find((c) => c.position === position);
    return cell ? { position, cellType: cell.cellType, config: (cell.config ?? {}) as Record<string, unknown> } : null;
  };
  return { registry, cells, cellAt, turnRollSeq: sp.rollSeq + 1 };
}

/** The holder's instances and snapshot, when a reaction window could open on their turn (§7.4). */
async function reactionScope(sp: SeasonPlayer, config: SeasonConfig, registry: SeasonRegistry): Promise<{ rows: IeeInstanceRow[]; self: IeePlayerSnapshot } | null> {
  if (!config.iee.enabled) return null;
  const rows = await listActiveInstances(sp.id);
  if (!holdsReactionItem(registry, rows)) return null;
  const self = await toPlayerSnapshot(sp);
  const victimChoicePending = await hasPendingDecision(sp.id, "victim_choice");
  return mayReact({ registry, rows, self, victimChoicePending, rng: Math.random }) ? { rows, self } : null;
}

export async function applyResolvedTurn(
  input: ResolvedTurnInput,
): Promise<ResolvedTurnResult> {
  const { sp, outcome, config } = input;

  // --- statuses get their say on this turn ------------------------------------
  // Loaded once: querying per hook would run half a dozen statements for one
  // move and let the set change midway through it.
  const setting = await turnSetting(sp);
  const reacting = await reactionScope(sp, config, setting.registry);
  // Every draw is kept: a reaction window replays them (§7.4).
  const diceDraws = recorder(Math.random);
  const ruleDraws = recorder(Math.random);

  // --- passed / dropped: dice, move, landing cell — the pure domain engine ----
  // A player holding a reaction item the throw offers sees it first (§7.4).
  const seen: { window: { view: ReactionView; offers: ReactionOffer[]; diceAt: number; hooksAt: number } | null } = { window: null };
  const { hooks, played, objectDraws } = await playOnce({
    sp,
    config,
    setting,
    outcome,
    dice: diceDraws.rng,
    rules: ruleDraws.rng,
    ...(reacting
      ? {
          react: (view: ReactionView) => {
            const offers = reactionOffers({
              registry: setting.registry,
              rows: reacting.rows,
              view,
              self: reacting.self,
              rollSeq: setting.turnRollSeq,
              rng: ruleDraws.rng,
            });
            seen.window = { view, offers, diceAt: diceDraws.draws.length, hooksAt: ruleDraws.draws.length };
            return null;
          },
        }
      : {}),
  });
  const window = seen.window;
  if (window && window.offers.length > 0) {
    return pauseForReaction(input, setting, played, window, { dice: diceDraws.draws, hooks: ruleDraws.draws });
  }
  return writeTurn({ ...input, setting, hooks, played, objectDraws });
}

/**
 * The turn pauses for the player's reaction (§7.4): the window opens holding
 * the turn — the throw shown, the move it makes as it stands, every draw made
 * so far — and nothing else is written but what the caller asked to go with it.
 */
async function pauseForReaction(
  input: ResolvedTurnInput,
  setting: TurnSetting,
  played: PlayedTurn,
  window: { view: ReactionView; offers: ReactionOffer[]; diceAt: number; hooksAt: number },
  draws: { dice: number[]; hooks: number[] },
): Promise<ResolvedTurnResult> {
  const { sp, config } = input;
  const context: ReactionContext = {
    rollId: input.roll.id,
    outcome: input.outcome,
    notes: input.notes,
    rating: input.rating,
    ...(input.feedExtra ? { feedExtra: input.feedExtra } : {}),
    view: {
      faces: [...window.view.faces],
      throws: window.view.throws.map((t) => [...t]),
      dice: { ...window.view.dice },
      result: played.result,
      from: sp.position,
      to: played.movedTo,
      cellType: played.moveCancelled ? null : (setting.cellAt(played.movedTo)?.cellType ?? null),
      rules: diceRulesOf(window.view.rules),
    },
    draws: { dice: [...draws.dice], hooks: [...draws.hooks], diceAt: window.diceAt, hooksAt: window.hooksAt },
    offers: window.offers.map((o) => ({ instanceId: o.instanceId, key: o.key, rules: o.rules })),
  };
  const decisions: DecisionNote[] = [];
  const opened = await db.transaction(async (tx) => {
    const exec = await executionContext({
      tx,
      seasonId: sp.seasonId,
      config: config.iee,
      registry: setting.registry,
      actorPlayerId: sp.id,
      decisions,
    });
    const row = await openReactionWindow(exec, {
      playerId: sp.id,
      context: { ...context },
      offers: context.offers.map((o) => ({ instanceId: o.instanceId, key: o.key })),
    });
    // A judge's approval opens the window: it is written with it (§7.4).
    if (input.extraWrites) await input.extraWrites(tx, { moveId: null });
    if (input.extraEvents && input.extraEvents.length > 0) {
      await tx.insert(eventLog).values(
        input.extraEvents.map((e) => ({ seasonId: sp.seasonId, seasonPlayerId: e.seasonPlayerId ?? sp.id, eventType: e.eventType, payload: e.payload })),
      );
    }
    return row;
  });
  await announceDecisions(decisions);
  log.debug("game.resolve.reaction_window", { rollId: input.roll.id, decisionId: opened.id, offers: context.offers.length });
  return {
    diceResults: [...window.view.faces],
    fromPosition: sp.position,
    toPosition: sp.position,
    newBalancePoints: sp.balancePoints,
    reaction: { decisionId: opened.id, faces: [...window.view.faces] },
  };
}

/**
 * Answers a reaction window (§7.4) and writes the turn it held: accepted —
 * every draw replayed, so the move is the one shown — or with the item used —
 * the throw replayed, the item acting at step 4, the rest drawn afresh. The
 * item's charge, the answer and the turn are one transaction. Only the player
 * uses an item; a judge may accept for them.
 */
export async function answerReactionWindow(input: {
  decision: IeeDecisionRow;
  sp: SeasonPlayer;
  config: SeasonConfig;
  /** Null: the default, accepting. */
  choice: DecisionChoice | null;
  by: "player" | "judge";
  userId: string | null;
}): Promise<ResolvedTurnResult> {
  const { decision, sp, config } = input;
  const context = decision.context as ReactionContext;
  const option = input.choice?.option ?? "accept";
  if (option !== "accept" && option !== "react") throw new GameLoopError("ieeDecisionChoiceInvalid");
  if (option === "react" && input.by !== "player") throw new GameLoopError("gameNotAllowed");
  const picked = option === "react" ? (input.choice?.picks?.[0] ?? null) : null;
  if (option === "react") {
    const among = (decision.options as DecisionOption[]).find((o) => o.kind === "react")?.params.among ?? [];
    if (!picked || !among.includes(picked)) throw new GameLoopError("ieeDecisionChoiceInvalid");
  }
  const roll = (await db.select().from(gameRolls).where(eq(gameRolls.id, context.rollId)).limit(1))[0];
  if (!roll || roll.status === "passed" || roll.status === "dropped" || roll.status === "rerolled") {
    throw new GameLoopError("gameRollAlreadyResolved");
  }

  const setting = await turnSetting(sp);
  const rows = config.iee.enabled ? await listActiveInstances(sp.id) : [];
  const self = await toPlayerSnapshot(sp);
  // Accepting replays every draw; using an item, those made before the window (§7.4).
  const all = option === "accept";
  const diceRng = replayer(all ? context.draws.dice : context.draws.dice.slice(0, context.draws.diceAt), Math.random);
  const ruleRng = replayer(all ? context.draws.hooks : context.draws.hooks.slice(0, context.draws.hooksAt), Math.random);
  const used: { offer: ReactionOffer | null } = { offer: null };
  const { hooks, played, objectDraws } = await playOnce({
    sp,
    config,
    setting,
    outcome: context.outcome,
    dice: diceRng,
    rules: ruleRng,
    react: (view) => {
      // Asked again as it was asked, so the rules draw what they drew then.
      const offers = reactionOffers({ registry: setting.registry, rows, view, self, rollSeq: setting.turnRollSeq, rng: ruleRng });
      if (!picked) return null;
      used.offer = offers.find((o) => o.instanceId === picked) ?? null;
      return used.offer?.rules ?? null;
    },
  });
  // The item no longer acts on this throw — gone, spent, or its rules no longer hold.
  if (picked && !used.offer) throw new GameLoopError("ieeDecisionChoiceInvalid");
  const before = played.reaction?.before ?? played.diceResults;
  const after = played.reaction?.after ?? played.diceResults;
  const offer = used.offer;
  const item = offer ? setting.registry.item(offer.revisionId) : null;
  return writeTurn({
    sp,
    roll,
    outcome: context.outcome,
    notes: context.notes,
    rating: context.rating,
    config,
    ...(context.feedExtra ? { feedExtra: context.feedExtra } : {}),
    setting,
    hooks,
    played,
    objectDraws,
    beforeSettle: async (exec) => {
      if (offer) {
        // Through the namespace: a bare `useCharge(…)` reads as a React hook to the lint.
        const spent = await executor.useCharge(exec, { instanceId: offer.instanceId, targetPlayerId: null });
        if (!spent) throw new GameLoopError("ieeItemAlreadyUsed");
      }
      const settled = await settleReactionWindow(exec, decision, {
        choice: picked ? { option: "react", picks: [picked] } : { option: "accept" },
        by: input.by,
        userId: input.userId,
        before,
        after,
      });
      if (settled === null) throw new GameLoopError("ieeDecisionSettled");
    },
    // The use is public, as every use is (§8.3): what the item did to the dice.
    leadEvents:
      offer && item
        ? [
            {
              eventType: "item_used",
              payload: {
                itemKey: item.key,
                name: item.names,
                targetSeasonPlayerId: null,
                targetUsername: null,
                // What it did: the faces it was used on, the throws it made, those that counted, the result (§9.3).
                reaction: played.reaction
                  ? { before: [...before], thrown: played.reaction.thrown, after: [...after], result: played.reaction.result }
                  : { before: [...before], after: [...after] },
              },
            },
          ]
        : [],
  });
}

/**
 * Plays the turn once (§7.1): the holder's statuses are read — once, so the set
 * cannot change midway through a move — and the engine's turn plays with them.
 * The statuses have their say at every hook; the points each step moves come
 * back as ledger lines, written in the order they happened. Both the turn and
 * the answer to its reaction window play it here.
 */
async function playOnce(input: {
  sp: SeasonPlayer;
  config: SeasonConfig;
  setting: TurnSetting;
  outcome: "passed" | "dropped";
  /** The dice's draws, and the rules'. */
  dice: () => number;
  rules: () => number;
  react?: (view: ReactionView) => ReactionRules | null;
}): Promise<{ hooks: TurnHooks; played: PlayedTurn; objectDraws?: (instanceId: string) => readonly number[] }> {
  const { sp, config, setting, outcome } = input;
  const { registry, turnRollSeq } = setting;
  const hooks = await loadTurnHooks(sp, config.iee.enabled, turnRollSeq, registry, input.rules);
  const turnBase = { rollSeq: turnRollSeq, outcome };
  // The objects on the board act on the move's way (wave D, spec §7.7): asked with the mover's rules' draws.
  const objects = config.iee.enabled ? await listActiveObjects(sp.seasonId) : [];
  const board =
    objects.length > 0
      ? executor.boardObjects({ registry, rng: input.rules }, objects, {
          self: await toPlayerSnapshot(sp),
          selfEntries: executor.factsOfRows(registry, await listActiveInstances(sp.id)),
        })
      : null;
  const played = playTurn({
    position: sp.position,
    balancePoints: sp.balancePoints,
    streakPass: sp.streakPass,
    streakDrop: sp.streakDrop,
    config,
    turn: turnBase,
    cellAt: setting.cellAt,
    hooks: hooks.run,
    diceRng: () => input.dice,
    ...(input.react ? { react: input.react } : {}),
    ...(board ? { objectAt: board.objectAt } : {}),
  });
  return { hooks, played, ...(board ? { objectDraws: board.draws } : {}) };
}

/** A turn played, ready to write: what it read and what came of it. */
interface TurnWrite extends ResolvedTurnInput {
  setting: TurnSetting;
  hooks: TurnHooks;
  played: PlayedTurn;
  /** Writes of this turn before its settlement — a reaction's charge and answer (§7.4). */
  beforeSettle?: (exec: ExecContext) => Promise<void>;
  /** Feed rows before the turn's own — a reaction item's use. */
  leadEvents?: FeedEntry[];
  /** What the objects the move met drew, for their journal rows (wave D). */
  objectDraws?: (instanceId: string) => readonly number[];
}

/** Writes a turn, every IEE write through the executor, in one transaction. */
async function writeTurn(t: TurnWrite): Promise<ResolvedTurnResult> {
  const { sp, roll, outcome, config, setting, hooks, played } = t;
  const { registry, cells, turnRollSeq } = setting;

  // The engine FSM requires rolled → in_progress before the outcome: a player
  // marking the result effectively moves the roll to in_progress at that moment.
  const effectiveStatus = roll.status === "rolled" ? "in_progress" : roll.status;

  // `noMove`: the regular move is cancelled — the token stays, so no cell
  // fires and no wheel spins (a cell fires only at the end of a move).
  const moveCancelled = played.moveCancelled;
  const landedType: string | null = played.landed?.cellType ?? null;
  const finalPosition = played.finalPosition;
  let finalBalance = played.moveBalance;
  /** True when a status swallowed the landing cell instead of it applying. */
  const cellAbsorbed = played.cellAbsorbed;
  /** The status that did, for the feed line — named from its revision. */
  let absorbedBy: { key: string; name: IeeLocaleText } | null = null;
  if (cellAbsorbed) {
    const vetoed = hooks.fired.find((f) => f.hook === "beforeCellEffect" && f.patch.skipCellEffect);
    const entry = vetoed ? registry.get(vetoed.revisionId) : null;
    if (entry) absorbedBy = { key: entry.key, name: entry.names };
  }

  // --- items / effects: decide before the transaction, persist inside it ------
  // The context read is advisory (see loadWheelContext); the pick and every
  // write it implies happen in the same transaction as the move below, so a
  // page refresh replays a finished decision instead of spinning again.
  // A ward absorbs the *landing*, not half of it.
  //
  // `beforeCellEffect` already vetoed the cell's own effect above, but the
  // wheel is a second consequence of the same landing and used to spin
  // regardless: the charge was spent, the balance was saved, and the player
  // was handed the negative status anyway — the exact thing the ward exists
  // to prevent. A veto that one consumer honours and another ignores is worse
  // than no veto, because the cost is paid and the protection is not
  // delivered.
  /**
   * Reaching the end of the board finishes the run.
   *
   * Checked against the position the player *ends* on, after the landing cell
   * has had its say — a teleport can move them again, and a teleport onto the
   * last cell finishes them just as much as walking there.
   *
   * On a non-looping board `normalizePosition` clamps at `size - 1`, so an
   * overshoot lands exactly on the finish cell and there is nothing to round.
   * A looping board has no finish cell at all (`generateBoardCells` only places
   * one when `loop` is off), so nothing here fires and such a season ends the
   * way it always did — when the host says so.
   *
   * Nothing did this before: the `finish` cell was a no-op, so a player parked
   * on the last cell and went on rolling, and the winner was whoever the
   * leaderboard query happened to put first when someone looked.
   */
  const finishedNow = sp.status === "active" && played.reachedFinish;

  const wheelPolarity = played.wheel;
  // The landing's own wheel, then each one more a rule asked for (spec §6.12).
  const wheels = [...(wheelPolarity ? [wheelPolarity] : []), ...played.extraWheels];
  const wheelContext =
    wheels.length > 0 && config.iee.enabled ? await loadWheelContext(sp, registry, finalPosition) : null;

  const newStatus = nextRollStatus(effectiveStatus, outcome);
  let wheel: WheelOutcome | undefined;

  // fetch game title for feed payload
  let gameTitle: string | null = null;
  if (roll.gameId) {
    const g = await db
      .select({ title: gamesCatalog.title })
      .from(gamesCatalog)
      .where(eq(gamesCatalog.id, roll.gameId))
      .limit(1);
    gameTitle = g[0]?.title ?? null;
  }

  // What the turn asks its players to choose (§7.6), announced once it commits.
  const decisions: DecisionNote[] = [];
  await db.transaction(async (tx) => {
    await tx
      .update(gameRolls)
      .set({
        status: newStatus,
        resolvedAt: new Date(),
        notes: t.notes,
        rating: t.rating,
      })
      .where(eq(gameRolls.id, roll.id));
    const [move] = await tx
      .insert(moves)
      .values({
        seasonPlayerId: sp.id,
        gameRollId: roll.id,
        fromPosition: sp.position,
        toPosition: finalPosition,
        diceResults: played.diceResults,
        cellLandedType: landedType as never,
      })
      .returning({ id: moves.id });
    if (played.moveLedger) {
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: sp.id,
        delta: played.moveLedger.delta,
        reason: played.moveLedger.reason,
        relatedMoveId: move!.id,
      });
    }
    await tx
      .update(seasonPlayers)
      .set({
        position: finalPosition,
        balancePoints: finalBalance,
        streakPass: played.newStreakPass,
        streakDrop: played.newStreakDrop,
        rollSeq: turnRollSeq,
        // Same statement as the move that earned it, so a finish can never be
        // recorded without its move or a move without its finish.
        ...(finishedNow ? { status: "finished" as const, finishedAt: new Date() } : {}),
      })
      .where(eq(seasonPlayers.id, sp.id));

    // Every IEE write of this turn goes through the executor, in this
    // transaction — the wheel's grant, the charges, the counters.
    const exec = await executionContext({
      tx,
      seasonId: sp.seasonId,
      config: config.iee,
      registry,
      actorPlayerId: sp.id,
      ...(wheelContext ? { seasonRollSeq: wheelContext.seasonRollSeq } : {}),
      // An out-of-turn move a drop makes lands on the board this turn played.
      board: {
        size: cells.length > 0 ? Math.max(...cells.map((c) => c.position)) + 1 : config.board.size,
        loop: config.board.loop,
        finishAt: cells.find((c) => c.cellType === "finish")?.position ?? null,
      },
      decisions,
    });
    // A reaction acted before the move: its charge and its answer come first (§7.4).
    if (t.beforeSettle) await t.beforeSettle(exec);
    // The game is reported: the completion conditions it held end with it (§6.17).
    if (config.iee.enabled && givesConditions(registry)) await endRollConditions(exec, { rollId: roll.id, playerId: sp.id });
    const ieeEvents: FeedEntry[] = [];
    // The objects the move met acted, and are gone (wave D, spec §6.18) — public, as objects are.
    if (played.objects.length > 0) {
      ieeEvents.push(...(await executor.triggerObjects(exec, { mover: sp.id, fired: played.objects, ...(t.objectDraws ? { draws: t.objectDraws } : {}) })));
    }
    // The move ended where others stand (wave D, spec §6.19): their entries answer the rival who arrived — «Корона» changes hands.
    // A cancelled move, or one that ends where it began, arrives nowhere.
    if (config.iee.enabled && !moveCancelled && finalPosition !== sp.position) {
      ieeEvents.push(...(await executor.sameCell(exec, { arrived: sp.id, at: finalPosition, reveal: config.iee.revealDropsInFeed })));
    }
    if (wheelContext) {
      const spun = await applyWheels(exec, {
        sp,
        wheels,
        iee: config.iee,
        context: wheelContext,
        moveId: move!.id,
        turnRollSeq,
        rng: Math.random,
      });
      // The dashboard animates the landing's own spin; one more shows in the inventory and the feed.
      if (wheelPolarity) wheel = spun.outcomes[0];
      ieeEvents.push(...spun.events);
    }
    // onOutcome and onTick can move points — an effect that pays out on a
    // pass, say. Each is a ledger line of its own, recording what moved.
    for (const line of played.later) {
      await tx
        .update(seasonPlayers)
        .set({ balancePoints: line.balance })
        .where(eq(seasonPlayers.id, sp.id));
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: sp.id,
        delta: line.delta,
        reason: line.reason,
        relatedMoveId: move!.id,
      });
      finalBalance = line.balance;
    }
    // Charges asked for across every hook are spent once, the rules' intents
    // are carried out, and this roll's durations count down (spec §7.9).
    ieeEvents.push(
      ...(await settleTurnHooks(exec, hooks, {
        seasonPlayerId: sp.id,
        turnRollSeq,
        outcome,
        moved: !moveCancelled,
        reveal: config.iee.revealDropsInFeed,
      })),
    );

    // An event cell hands out a challenge from the season's pool.
    if (landedType === "event" && config.iee.enabled) {
      ieeEvents.push(
        ...(await assignEventFromCell(tx, {
          seasonId: sp.seasonId,
          seasonPlayerId: sp.id,
          pool: config.iee.events,
          moveId: move!.id,
          rng: Math.random,
        })),
      );
    }

    // Gated by the same flag: a season that hides what its cells hand out
    // should not narrate those statuses at their other end either.
    if (cellAbsorbed && config.iee.revealDropsInFeed) {
      ieeEvents.push({
        eventType: "effect_cleansed",
        payload: {
          absorbed: landedType,
          by: absorbedBy?.key ?? "ward",
          effectKey: absorbedBy?.key ?? null,
          name: absorbedBy?.name ?? null,
        },
      });
    }

    if (finishedNow) {
      ieeEvents.push({
        eventType: "player_finished",
        payload: { position: finalPosition, rollSeq: turnRollSeq },
      });
    }

    // The caller's own writes belong to this turn, so they share its
    // transaction: a judge's approval and the move it authorised are one fact.
    if (t.extraWrites) await t.extraWrites(tx, { moveId: move!.id });

    const row = (e: FeedEntry) => ({
      seasonId: sp.seasonId,
      // A rival a drop moved out of turn is the subject of their own row.
      seasonPlayerId: e.seasonPlayerId ?? sp.id,
      eventType: e.eventType,
      payload: e.payload,
    });
    await tx.insert(eventLog).values([
      ...(t.leadEvents ?? []).map(row),
      {
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: outcome === "passed" ? "game_passed" : "game_dropped",
        payload: {
          gameId: roll.gameId,
          title: gameTitle,
          dice: played.diceResults,
          notes: t.notes,
          rating: t.rating,
          ...(t.feedExtra ?? {}),
        },
      },
      {
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: "moved",
        payload: {
          from: sp.position,
          to: finalPosition,
          dice: played.diceResults,
          cellType: landedType,
        },
      },
      ...[...ieeEvents, ...(t.extraEvents ?? [])].map(row),
    ]);
  });

  await announceDecisions(decisions);

  log.debug("game.resolve.completed", {
    rollId: roll.id,
    outcome,
    to: finalPosition,
    balanceDelta: finalBalance - sp.balancePoints,
  });

  return {
    diceResults: played.diceResults,
    fromPosition: sp.position,
    toPosition: finalPosition,
    newBalancePoints: finalBalance,
    ...(wheel === undefined ? {} : { wheel }),
  };
}
