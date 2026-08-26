import { and, desc, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { eventLog, gameRolls, moves, ledgerEntries, seasonPlayers } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getBoardCells, getMainBoard, getSeasonById } from "@/lib/repositories/seasons.repo";
import {
  countRerollsForGame,
  createRoll,
  rollRandomGame,
  updateRollStatus,
} from "@/lib/repositories/games.repo";
import { getSeasonPlayerById } from "@/lib/repositories/players.repo";
import { logEvent } from "@/lib/repositories/events.repo";
import {
  applyCellEffect,
  canReroll,
  DEFAULT_SEASON_CONFIG,
  nextRollStatus,
  resolveMovement,
  SeasonConfigSchema,
  type RollOutcome,
  type SeasonConfig,
} from "@/game-engine";

export class GameLoopError extends Error {}

function parseSeasonConfig(raw: unknown): SeasonConfig {
  const parsed = SeasonConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
}

/** Владелец записи season_players или staff — остальные не допускаются. */
async function assertActorAllowed(
  seasonPlayerId: string,
  playerId: string,
): Promise<void> {
  const actor = await getCurrentUser();
  if (actor && actor.id === playerId) return;
  if (actor && isStaff(actor)) return;
  throw new GameLoopError("Недостаточно прав для этого действия");
}

/**
 * Ролл новой игры игроку. Игра выбирается на сервере случайным образом
 * из каталога (без блэклиста и уже сыгранных этим участником).
 */
export async function rollNewGame(seasonPlayerId: string): Promise<string> {
  const sp = await getSeasonPlayerById(seasonPlayerId);
  if (!sp) throw new GameLoopError("Участник не найден");
  await assertActorAllowed(sp.id, sp.playerId);

  const season = await getSeasonById(sp.seasonId);
  if (!season || season.status !== "active") {
    throw new GameLoopError("Сезон не активен");
  }
  const open = await getOpenRollRow(sp.id);
  if (open) throw new GameLoopError("У вас уже есть наролленная игра");

  const game = await rollRandomGame(sp.id);
  const roll = await createRoll(sp.id, game?.id ?? null);
  await logEvent({
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    eventType: "game_rolled",
    payload: { gameId: game?.id ?? null, title: game?.title ?? null },
  });
  void updateRollStatus; // статус уже 'rolled' при создании
  return roll.id;
}

/**
 * Разрешение ролла игроком: passed / dropped / rerolled.
 * Случайные числа генерируются только на сервере.
 */
export async function resolveGameRoll(params: {
  rollId: string;
  outcome: RollOutcome;
}): Promise<{
  diceResults?: number[];
  fromPosition: number;
  toPosition: number;
  newBalancePoints: number;
}> {
  const actor = await getCurrentUser();
  if (!actor) throw new GameLoopError("Требуется вход");

  const rollRows = await db
    .select()
    .from(gameRolls)
    .where(eq(gameRolls.id, params.rollId))
    .limit(1);
  const roll = rollRows[0];
  if (!roll) throw new GameLoopError("Ролл не найден");
  if (
    roll.status === "passed" ||
    roll.status === "dropped" ||
    roll.status === "rerolled"
  ) {
    throw new GameLoopError("Ролл уже разрешён");
  }

  const spRows = await db
    .select()
    .from(seasonPlayers)
    .where(eq(seasonPlayers.id, roll.seasonPlayerId))
    .limit(1);
  const sp = spRows[0];
  if (!sp) throw new GameLoopError("Участник не найден");
  await assertActorAllowed(sp.id, sp.playerId);

  const season = await getSeasonById(sp.seasonId);
  if (!season) throw new GameLoopError("Сезон не найден");
  if (season.status !== "active") throw new GameLoopError("Сезон не активен");

  const config = parseSeasonConfig(season.config);

  // --- rerolled: новый ролл игры без движения ------------------------------
  if (params.outcome === "rerolled") {
    if (!config.rerolls.allowed || !canReroll(sp.rerollsUsed, config)) {
      throw new GameLoopError("Лимит рероллов исчерпан");
    }
    const rerollsThisGame = await countRerollsForGame(sp.id, roll.gameId);
    if (rerollsThisGame >= config.rerolls.limitPerGame) {
      throw new GameLoopError("Лимит рероллов для этой игры исчерпан");
    }
    const game = await rollRandomGame(sp.id);
    await db.transaction(async (tx) => {
      await tx
        .update(gameRolls)
        .set({ status: "rerolled", resolvedAt: new Date() })
        .where(eq(gameRolls.id, roll.id));
      await tx.insert(gameRolls).values({
        seasonPlayerId: sp.id,
        gameId: game?.id ?? null,
        status: "rolled",
      });
      await tx
        .update(seasonPlayers)
        .set({ rerollsUsed: sp.rerollsUsed + 1 })
        .where(eq(seasonPlayers.id, sp.id));
      await tx.insert(eventLog).values({
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: "game_rerolled",
        payload: {
          oldGameId: roll.gameId,
          newGameId: game?.id ?? null,
          title: game?.title ?? null,
        },
      });
    });
    return {
      fromPosition: sp.position,
      toPosition: sp.position,
      newBalancePoints: sp.balancePoints,
    };
  }

  // --- passed / dropped: движение через чистый доменный движок --------------
  const result = resolveMovement({
    currentPosition: sp.position,
    balancePoints: sp.balancePoints,
    outcome: params.outcome,
    streakPass: sp.streakPass,
    streakDrop: sp.streakDrop,
    config,
    rng: Math.random,
  });

  // Эффект клетки приземления (plugin-реестр в движке)
  let landedType: string | null = null;
  let finalPosition = result.newPosition;
  let finalBalance = result.newBalancePoints;
  let ledgerDelta = 0;
  let ledgerReason: string | undefined;

  const board = await getMainBoard(sp.seasonId);
  if (board) {
    const cells = await getBoardCells(board.id);
    const landed = cells.find((c) => c.position === finalPosition);
    if (landed) {
      landedType = landed.cellType;
      const effect = applyCellEffect(landed, finalPosition, finalBalance);
      finalPosition = effect.position;
      finalBalance = effect.balancePoints;
      ledgerDelta += effect.ledgerDelta;
      if (effect.reason) ledgerReason = effect.reason;
    }
  }

  const newStatus = nextRollStatus(roll.status, params.outcome);

  await db.transaction(async (tx) => {
    await tx
      .update(gameRolls)
      .set({ status: newStatus, resolvedAt: new Date() })
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
      })
      .where(eq(seasonPlayers.id, sp.id));
    await tx.insert(eventLog).values([
      {
        seasonId: sp.seasonId,
        seasonPlayerId: sp.id,
        eventType: params.outcome === "passed" ? "game_passed" : "game_dropped",
        payload: { gameId: roll.gameId, dice: result.diceResults },
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
    ]);
  });

  return {
    diceResults: result.diceResults,
    fromPosition: sp.position,
    toPosition: finalPosition,
    newBalancePoints: finalBalance,
  };
}

/** Незавершённый ролл участника (rolled/in_progress), если есть. */
export async function getOpenRollRow(seasonPlayerId: string) {
  const rows = await db
    .select()
    .from(gameRolls)
    .where(
      and(
        eq(gameRolls.seasonPlayerId, seasonPlayerId),
        or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")),
        isNull(gameRolls.resolvedAt),
      ),
    )
    .orderBy(desc(gameRolls.rolledAt))
    .limit(1);
  return rows[0] ?? null;
}
