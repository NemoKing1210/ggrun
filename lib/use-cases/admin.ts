import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  boardCells,
  boards,
  eventLog,
  gameRolls,
  ledgerEntries,
  moves,
  rerollRequests,
  seasons,
  seasonPlayers,
} from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getSeasonById } from "@/lib/repositories/seasons.repo";
import {
  addPlayerToSeason,
  getSeasonPlayerById,
  updateSeasonPlayer,
} from "@/lib/repositories/players.repo";
import { logAdminAction, logEvent } from "@/lib/repositories/events.repo";
import { log } from "@/lib/log";
import { SeasonConfigSchema } from "@/game-engine";

export class AdminError extends Error {
  /** Error code + interpolation params; the text is resolved via the i18n dictionary in actions. */
  constructor(
    public readonly code: string,
    public readonly params: Record<string, string> = {},
  ) {
    super(code);
  }
}

async function requireStaff(): Promise<NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new AdminError("adminStaffRequired");
  return user;
}

export const createSeasonSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug: lowercase latin letters, digits, hyphens"),
  config: SeasonConfigSchema.optional(),
  cloneBoardFromSeasonId: z.string().uuid().optional(),
});

/** Creates a season (draft), optionally cloning the board from another season. */
export async function createSeason(input: unknown): Promise<string> {
  const actor = await requireStaff();
  const parsed = createSeasonSchema.parse(input);

  const created = await db.transaction(async (tx) => {
    const [season] = await tx
      .insert(seasons)
      .values({
        slug: parsed.slug,
        title: parsed.title,
        config: parsed.config ?? {},
      })
      .returning({ id: seasons.id });

    let boardSourceId: string | null = null;
    if (parsed.cloneBoardFromSeasonId) {
      const src = await tx.query.seasons.findFirst({
        where: eq(seasons.id, parsed.cloneBoardFromSeasonId),
      });
      if (src) {
        const srcBoards = await tx.query.boards.findFirst({
          where: eq(boards.seasonId, src.id),
        });
        boardSourceId = srcBoards?.id ?? null;
      }
    }

    if (boardSourceId) {
      const [newBoard] = await tx
        .insert(boards)
        .values({ seasonId: season!.id })
        .returning({ id: boards.id });
      const srcCells = await tx
        .select()
        .from(boardCells)
        .where(eq(boardCells.boardId, boardSourceId))
        .orderBy(boardCells.position);
      if (srcCells.length > 0) {
        await tx.insert(boardCells).values(
          srcCells.map((c) => ({
            boardId: newBoard!.id,
            position: c.position,
            cellType: c.cellType,
            label: c.label,
            config: c.config,
          })),
        );
      }
    } else {
      // Default 40-cell board: start + finish + regular cells
      const [newBoard] = await tx
        .insert(boards)
        .values({ seasonId: season!.id })
        .returning({ id: boards.id });
      const cells = Array.from({ length: 40 }, (_, i) => ({
        boardId: newBoard!.id,
        position: i,
        cellType:
          i === 0 ? ("start" as const) : i === 39 ? ("finish" as const) : ("normal" as const),
      }));
      await tx.insert(boardCells).values(cells);
    }
    return season!;
  });

  await logAdminAction({
    actorId: actor.id,
    actionType: "season_created",
    targetType: "season",
    targetId: created.id,
    payload: { title: parsed.title, slug: parsed.slug },
  });
  log.info("season.create.persisted", { actorId: actor.id, seasonId: created.id });
  return created.id;
}

const statusTransitions: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["paused", "finished"],
  paused: ["active", "finished"],
  finished: ["archived"],
  archived: [],
};

/** Changes the season status along allowed transitions + snapshot on start. */
export async function changeSeasonStatus(
  seasonId: string,
  newStatus: "draft" | "active" | "paused" | "finished" | "archived",
): Promise<void> {
  const actor = await requireStaff();
  const season = await getSeasonById(seasonId);
  if (!season) {
    log.debug("season.status_change.season_not_found", { actorId: actor.id, seasonId });
    throw new AdminError("adminSeasonNotFound");
  }
  if (!statusTransitions[season.status]!.includes(newStatus)) {
    log.debug("season.status_change.invalid_transition", {
      actorId: actor.id,
      seasonId,
      from: season.status,
      to: newStatus,
    });
    throw new AdminError("adminInvalidTransition", {
      from: season.status,
      to: newStatus,
    });
  }
  await db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === "active") patch.startedAt = new Date();
    if (newStatus === "finished") patch.finishedAt = new Date();
    await tx.update(seasons).set(patch).where(eq(seasons.id, seasonId));
    if (newStatus === "active") {
      // Start snapshot: reset positions/balance/streaks for all participants
      await tx
        .update(seasonPlayers)
        .set({ position: 0, balancePoints: 0, streakPass: 0, streakDrop: 0 })
        .where(eq(seasonPlayers.seasonId, seasonId));
    }
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: `season_status_${newStatus}`,
    targetType: "season",
    targetId: seasonId,
  });
  if (newStatus === "active") {
    log.info("season.started", { actorId: actor.id, seasonId });
    await logEvent({ seasonId, eventType: "season_started", payload: {} });
  }
  log.info("season.status_change.persisted", {
    actorId: actor.id,
    seasonId,
    newStatus,
  });
}

/** Full reset: clears rolls/moves/ledger/rerolls/events and resets all participants to start. */
export async function resetSeason(seasonId: string): Promise<void> {
  const actor = await requireStaff();
  const season = await getSeasonById(seasonId);
  if (!season) {
    log.debug("season.reset.season_not_found", { actorId: actor.id, seasonId });
    throw new AdminError("adminSeasonNotFound");
  }
  const parsed = SeasonConfigSchema.safeParse(season.config);
  const cfg = parsed.success ? parsed.data : (await import("@/game-engine")).DEFAULT_SEASON_CONFIG;
  const startingBalance = cfg.points.startingBalance ?? 0;

  await db.transaction(async (tx) => {
    const players = await tx.select({ id: seasonPlayers.id }).from(seasonPlayers).where(eq(seasonPlayers.seasonId, seasonId));
    const ids = players.map((p) => p.id);
    if (ids.length > 0) {
      await tx.delete(rerollRequests).where(inArray(rerollRequests.seasonPlayerId, ids));
      await tx.delete(ledgerEntries).where(inArray(ledgerEntries.seasonPlayerId, ids));
      await tx.delete(moves).where(inArray(moves.seasonPlayerId, ids));
      await tx.delete(gameRolls).where(inArray(gameRolls.seasonPlayerId, ids));
      await tx.delete(eventLog).where(eq(eventLog.seasonId, seasonId));
      await tx
        .update(seasonPlayers)
        .set({
          position: 0,
          balancePoints: startingBalance,
          streakPass: 0,
          streakDrop: 0,
          rerollsUsed: 0,
          status: "active",
        })
        .where(eq(seasonPlayers.seasonId, seasonId));
    } else {
      await tx.delete(eventLog).where(eq(eventLog.seasonId, seasonId));
    }
    await tx
      .update(seasons)
      .set({ status: "active", startedAt: new Date(), finishedAt: null })
      .where(eq(seasons.id, seasonId));
  });

  await logAdminAction({
    actorId: actor.id,
    actionType: "season_reset",
    targetType: "season",
    targetId: seasonId,
  });
  await logEvent({ seasonId, eventType: "season_reset", payload: { by: actor.id } });
  log.info("season.reset.persisted", { actorId: actor.id, seasonId });
}

export async function updateSeasonSettings(input: {
  seasonId: string;
  config: unknown;
  rulesMd?: string | null;
}): Promise<void> {
  const actor = await requireStaff();
  const config = SeasonConfigSchema.parse(input.config);
  await db.transaction(async (tx) => {
    await tx
      .update(seasons)
      .set({ config, ...(input.rulesMd !== undefined ? { rulesMd: input.rulesMd } : {}) })
      .where(eq(seasons.id, input.seasonId));

    // Optionally regenerate board when requested.
    if (config.board.regenerateOnSave) {
      const [existingBoard] = await tx.select().from(boards).where(eq(boards.seasonId, input.seasonId)).limit(1);
      let boardId = existingBoard?.id;
      if (!boardId) {
        const [created] = await tx.insert(boards).values({ seasonId: input.seasonId }).returning({ id: boards.id });
        boardId = created!.id;
      }
      // Clear previous cells and generate fresh distribution
      await tx.delete(boardCells).where(eq(boardCells.boardId, boardId));
      const { generateBoardCells } = await import("@/lib/game-pool/board-generator");
      const cells = generateBoardCells(config);
      if (cells.length > 0) {
        await tx.insert(boardCells).values(
          cells.map((c) => ({
            boardId: boardId!,
            position: c.position,
            cellType: c.cellType,
            label: c.label,
            config: c.config,
          })),
        );
      }
      // Turn off flag after regeneration so next saves don't re-roll unintentionally,
      // but keep the stored config with regenerateOnSave=false for clarity.
      const withoutRegen = { ...config, board: { ...config.board, regenerateOnSave: false } };
      await tx.update(seasons).set({ config: withoutRegen }).where(eq(seasons.id, input.seasonId));
    }
  });
  log.info("season.settings.update.persisted", { actorId: actor.id, seasonId: input.seasonId });
   await logAdminAction({
    actorId: actor.id,
    actionType: "season_settings_updated",
    targetType: "season",

    targetId: input.seasonId,
    payload: { config },
  });
}


// --- Board editor ---------------------------------------------------------

export async function setBoardCell(input: {
  boardId: string;
  position: number;
  cellType: (typeof boardCells.$inferInsert)["cellType"];
  label?: string | null;
  config?: Record<string, unknown>;
}): Promise<void> {
  const actor = await requireStaff();
  await db
    .insert(boardCells)
    .values({
      boardId: input.boardId,
      position: input.position,
      cellType: input.cellType,
      label: input.label ?? null,
      config: input.config ?? {},
    })
    .onConflictDoUpdate({
      target: [boardCells.boardId, boardCells.position],
      set: {
        cellType: input.cellType,
        label: input.label ?? null,
        config: input.config ?? {},
      },
  });
  log.info("board.cell.persisted", {
    actorId: actor.id,
    boardId: input.boardId,
    position: input.position,
    cellType: input.cellType,
  });
   await logAdminAction({
    actorId: actor.id,
    actionType: "board_cell_set",
    targetType: "board_cell",

    payload: { ...input },
  });
}

// --- Participant management ------------------------------------------------

export async function adminAddPlayer(seasonId: string, userId: string): Promise<void> {
  const actor = await requireStaff();
  await addPlayerToSeason(seasonId, userId);
  log.info("season.player_added.persisted", { actorId: actor.id, seasonId, userId });
   await logAdminAction({
    actorId: actor.id,
    actionType: "player_added",
    targetType: "season_player",

    payload: { seasonId, userId },
  });
  await logEvent({ seasonId, eventType: "player_joined", payload: { userId } });
}

export async function adminAdjustPlayer(input: {
  seasonPlayerId: string;
  position?: number;
  balancePoints?: number;
  status?: "active" | "finished" | "eliminated" | "withdrawn";
  reason: string;
}): Promise<void> {
  const actor = await requireStaff();
  const sp = await getSeasonPlayerById(input.seasonPlayerId);
  if (!sp) throw new AdminError("adminPlayerNotFound");
  const patch: Parameters<typeof updateSeasonPlayer>[1] = {};
  if (input.position !== undefined) patch.position = input.position;
  if (input.balancePoints !== undefined) patch.balancePoints = input.balancePoints;
  if (input.status !== undefined) patch.status = input.status;
  await updateSeasonPlayer(sp.id, patch);
  await logAdminAction({
    actorId: actor.id,
    actionType: "player_adjusted",
    targetType: "season_player",
    targetId: sp.id,
    payload: { ...patch, reason: input.reason },
  });
  log.info("season.player_adjusted.persisted", {
    actorId: actor.id,
    seasonId: sp.seasonId,
    seasonPlayerId: sp.id,
    patch,
  });
 }
