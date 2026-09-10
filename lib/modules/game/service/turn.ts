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
  type SeasonPlayer,
} from "@/db/schema";
import { getBoardCells, getMainBoard } from "@/lib/modules/season/repository/seasons";
import { log } from "@/lib/infrastructure/logger";
import {
  applyCellEffect,
  applyMovementModifiers,
  normalizePosition,
  nextRollStatus,
  resolveMovement,
  type RollOutcome,
  type SeasonConfig,
  type WheelOutcome,
} from "@/lib/engine";

import { assignEventFromCell } from "./events";
import {
  applyWheel,
  expireEffectsFor,
  loadTurnHooks,
  loadWheelContext,
  polarityForCell,
  settleTurnHooks,
  type FeedEntry,
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
 * subsystem off: no wheel spun, no status fired, no shield absorbed, no
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
  /** Extra writes for this same transaction, run before the feed batch. */
  extraWrites?: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    ctx: { moveId: string },
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
}

export async function applyResolvedTurn(
  input: ResolvedTurnInput,
): Promise<ResolvedTurnResult> {
  const { sp, roll, outcome, config } = input;

  // The engine FSM requires rolled → in_progress before the outcome: a player
  // marking the result effectively moves the roll to in_progress at that moment.
  const effectiveStatus = roll.status === "rolled" ? "in_progress" : roll.status;

  // --- statuses get their say on this turn ------------------------------------
  // Loaded once: querying per hook would run half a dozen statements for one
  // move and let the set change midway through it.
  // The roll being resolved. Computed once and used for every clock in this
  // turn — the activity filter in `loadTurnHooks`, the second filter inside
  // `runHook` (via `turnBase.rollSeq`), the `onTick` context and the expiry
  // sweep at the end. They used to disagree by one, which is exactly how a
  // one-roll status outlived its roll.
  const turnRollSeq = sp.rollSeq + 1;
  const hooks = await loadTurnHooks(sp, config.iee.enabled, turnRollSeq);
  const turnBase = { rollSeq: turnRollSeq, outcome };

  // --- passed / dropped: movement via the pure domain engine ------------------
  const beforeMove = hooks.run("beforeMovement", turnBase);
  const rawResult = resolveMovement({
    currentPosition: sp.position,
    balancePoints: sp.balancePoints,
    outcome,
    streakPass: sp.streakPass,
    streakDrop: sp.streakDrop,
    config,
    rng: Math.random,
    modifiers: beforeMove,
  });

  const afterMove = hooks.run("afterMovement", {
    ...turnBase,
    diceResults: rawResult.diceResults,
    fromPosition: sp.position,
    toPosition: rawResult.newPosition,
    balancePoints: rawResult.newBalancePoints,
  });
  const result = applyMovementModifiers(rawResult, afterMove, config.board, sp.position);

  // Landing cell effect (plugin registry in the engine)
  let landedType: string | null = null;
  let finalPosition = result.newPosition;
  let finalBalance = result.newBalancePoints;
  let ledgerDelta = 0;
  let ledgerReason: string | undefined;
  /** True when a status swallowed the landing cell instead of it applying. */
  let cellAbsorbed = false;

  const board = await getMainBoard(sp.seasonId);
  let cells: Awaited<ReturnType<typeof getBoardCells>> = [];
  let landedCell: Awaited<ReturnType<typeof getBoardCells>>[number] | undefined;
  if (board) {
    cells = await getBoardCells(board.id);
    landedCell = cells.find((c) => c.position === finalPosition);
    if (landedCell) {
      landedType = landedCell.cellType;
      const cellTurn = {
        ...turnBase,
        diceResults: result.diceResults,
        fromPosition: sp.position,
        toPosition: finalPosition,
        balancePoints: finalBalance,
        cellType: landedCell.cellType,
        cellConfig: (landedCell.config ?? {}) as Record<string, unknown>,
      };

      // A shield absorbs the landing here, before it is ever applied.
      const beforeCell = hooks.run("beforeCellEffect", cellTurn);
      if (!beforeCell.skipCellEffect) {
        const effect = applyCellEffect(
          { ...landedCell, config: (landedCell.config ?? {}) as Record<string, unknown> },
          finalPosition,
          finalBalance,
        );
        finalPosition = normalizePosition(effect.position, config.board);
        finalBalance = effect.balancePoints;
        ledgerDelta += effect.ledgerDelta;
        if (effect.reason) ledgerReason = effect.reason;
      } else {
        cellAbsorbed = true;
      }

      const afterCell = hooks.run("afterCellEffect", { ...cellTurn, toPosition: finalPosition });
      if (afterCell.balanceDelta !== 0) {
        // Same rule as the cell above and as `onOutcome` below: the ledger gets
        // the difference that actually happened, never the one that was asked
        // for. `taxed` on a player with nothing left used to take nothing and
        // record -1.
        const adjusted = Math.max(0, finalBalance + afterCell.balanceDelta);
        ledgerDelta += adjusted - finalBalance;
        finalBalance = adjusted;
        ledgerReason = ledgerReason ?? "iee_effect";
      }
    }
  }

  // --- items / effects: decide before the transaction, persist inside it ------
  // The context read is advisory (see loadWheelContext); the pick and every
  // write it implies happen in the same transaction as the move below, so a
  // page refresh replays a finished decision instead of spinning again.
  // A shield absorbs the *landing*, not half of it.
  //
  // `beforeCellEffect` already vetoed the cell's own effect above, but the
  // wheel is a second consequence of the same landing and used to spin
  // regardless: the charge was spent, the balance was saved, and the player
  // was handed the negative status anyway — the exact thing the shield exists
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
  const finishedNow =
    sp.status === "active" &&
    cells.find((c) => c.position === finalPosition)?.cellType === "finish";

  const wheelPolarity = cellAbsorbed ? null : polarityForCell(landedType);
  const wheelContext =
    wheelPolarity && config.iee.enabled ? await loadWheelContext(sp) : null;

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

  await db.transaction(async (tx) => {
    await tx
      .update(gameRolls)
      .set({
        status: newStatus,
        resolvedAt: new Date(),
        notes: input.notes,
        rating: input.rating,
      })
      .where(eq(gameRolls.id, roll.id));
    const [move] = await tx
      .insert(moves)
      .values({
        seasonPlayerId: sp.id,
        gameRollId: roll.id,
        fromPosition: sp.position,
        toPosition: finalPosition,
        diceResults: result.diceResults,
        cellLandedType: landedType as never,
      })
      .returning({ id: moves.id });
    if (ledgerDelta !== 0 && ledgerReason) {
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: sp.id,
        delta: ledgerDelta,
        reason: ledgerReason,
        relatedMoveId: move!.id,
      });
    }
    await tx
      .update(seasonPlayers)
      .set({
        position: finalPosition,
        balancePoints: finalBalance,
        streakPass: result.newStreakPass,
        streakDrop: result.newStreakDrop,
        rollSeq: turnRollSeq,
        // Same statement as the move that earned it, so a finish can never be
        // recorded without its move or a move without its finish.
        ...(finishedNow ? { status: "finished" as const, finishedAt: new Date() } : {}),
      })
      .where(eq(seasonPlayers.id, sp.id));

    const ieeEvents: FeedEntry[] = [];
    if (wheelPolarity && wheelContext) {
      const spun = await applyWheel(tx, {
        seasonId: sp.seasonId,
        sp,
        polarity: wheelPolarity,
        iee: config.iee,
        context: wheelContext,
        moveId: move!.id,
        nextRollSeq: turnRollSeq,
        rng: Math.random,
      });
      wheel = spun.outcome;
      ieeEvents.push(...spun.events);
    }
    // onOutcome can move points — an effect that pays out on a pass, say.
    const outcomeMods = hooks.run("onOutcome", {
      ...turnBase,
      toPosition: finalPosition,
      cellType: landedType ?? undefined,
    });
    if (outcomeMods.balanceDelta !== 0) {
      const adjusted = Math.max(0, finalBalance + outcomeMods.balanceDelta);
      await tx
        .update(seasonPlayers)
        .set({ balancePoints: adjusted })
        .where(eq(seasonPlayers.id, sp.id));
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: sp.id,
        delta: adjusted - finalBalance,
        reason: outcomeMods.reasons[0] ?? "iee_effect",
        relatedMoveId: move!.id,
      });
      finalBalance = adjusted;
    }
    hooks.run("onTick", turnBase);
    // Charges asked for across every hook of this turn are spent once, here.
    await settleTurnHooks(tx, hooks);

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

    // Statuses whose duration ran out end here — lazily, on the next resolve
    // that touches this player, because the project has no scheduler.
    ieeEvents.push(
      ...(await expireEffectsFor(tx, sp.id, turnRollSeq, config.iee.revealDropsInFeed)),
    );

    // Gated by the same flag: a season that hides what its cells hand out
    // should not narrate those statuses at their other end either.
    if (cellAbsorbed && config.iee.revealDropsInFeed) {
      ieeEvents.push({
        eventType: "effect_cleansed",
        payload: { absorbed: landedType, by: "shield" },
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
    if (input.extraWrites) await input.extraWrites(tx, { moveId: move!.id });

    await tx.insert(eventLog).values([
      {
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: outcome === "passed" ? "game_passed" : "game_dropped",
        payload: {
          gameId: roll.gameId,
          title: gameTitle,
          dice: result.diceResults,
          notes: input.notes,
          rating: input.rating,
          ...(input.feedExtra ?? {}),
        },
      },
      {
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: "moved",
        payload: {
          from: sp.position,
          to: finalPosition,
          dice: result.diceResults,
          cellType: landedType,
        },
      },
      ...[...ieeEvents, ...(input.extraEvents ?? [])].map((e) => ({
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: e.eventType,
        payload: e.payload,
      })),
    ]);
  });

  log.debug("game.resolve.completed", {
    rollId: roll.id,
    outcome,
    to: finalPosition,
    balanceDelta: finalBalance - sp.balancePoints,
  });

  return {
    diceResults: result.diceResults,
    fromPosition: sp.position,
    toPosition: finalPosition,
    newBalancePoints: finalBalance,
    ...(wheel === undefined ? {} : { wheel }),
  };
}
