import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/infrastructure/db";
import {
  boardCells,
  boards,
  eventLog,
  gameRolls,
  ledgerEntries,
  playerEffects,
  playerEvents,
  playerInventory,
  moves,
  rerollRequests,
  seasons,
  seasonPlayers,
} from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { slugify } from "@/lib/shared/utils/slugify";
import { generateSeasonTitle } from "@/lib/shared/utils/season-names";
import { logAdminAction, logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine";
import {
  boardMatchesConfig,
  boardShapeChanged,
  generateBoardCells,
} from "@/lib/modules/catalog/pool/board-generator";

import { AdminError } from "./errors";

async function requireStaff(): Promise<NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new AdminError("adminStaffRequired");
  return user;
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const existing = await db.select({ slug: seasons.slug }).from(seasons).where(eq(seasons.slug, base)).limit(1);
  if (existing.length === 0) return base;
  for (let i = 2; i < 20; i++) {
    const candidate = `${base}-${i}`;
    const dup = await db.select({ slug: seasons.slug }).from(seasons).where(eq(seasons.slug, candidate)).limit(1);
    if (dup.length === 0) return candidate;
  }
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
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

export async function createSeason(input: unknown): Promise<string> {
  const actor = await requireStaff();
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  let title = typeof raw.title === "string" ? raw.title.trim() : "";
  const requestedSlug = typeof raw.slug === "string" ? raw.slug.trim().toLowerCase() : "";

  if (!title) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateSeasonTitle();
      const candSlug = slugify(candidate);
      const exists = await db.select({ slug: seasons.slug }).from(seasons).where(eq(seasons.slug, candSlug)).limit(1);
      if (exists.length === 0) {
        title = candidate;
        break;
      }
    }
    if (!title) title = generateSeasonTitle();
  }

  let slug = requestedSlug || slugify(title);
  slug = slugify(slug);
  if (!slug) slug = slugify(title);
  slug = await ensureUniqueSlug(slug);

  const parsed = createSeasonSchema.parse({ ...raw, title, slug });
  const created = await db.transaction(async (tx) => {
    const [season] = await tx
      .insert(seasons)
      .values({ slug: parsed.slug, title: parsed.title, config: parsed.config ?? {} })
      .returning({ id: seasons.id });

    let boardSourceId: string | null = null;
    if (parsed.cloneBoardFromSeasonId) {
      const src = await tx.query.seasons.findFirst({ where: eq(seasons.id, parsed.cloneBoardFromSeasonId) });
      if (src) {
        const srcBoards = await tx.query.boards.findFirst({ where: eq(boards.seasonId, src.id) });
        boardSourceId = srcBoards?.id ?? null;
      }
    }

    if (boardSourceId) {
      const [newBoard] = await tx.insert(boards).values({ seasonId: season!.id }).returning({ id: boards.id });
      const srcCells = await tx.select().from(boardCells).where(eq(boardCells.boardId, boardSourceId)).orderBy(boardCells.position);
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
      const [newBoard] = await tx.insert(boards).values({ seasonId: season!.id }).returning({ id: boards.id });
      // Build the board from the season's own config. Using a flat 40-cell
      // board here used to strand every bonus/penalty/teleport/event count the
      // admin set: the config stored them, the board never had them.
      const cells = generateBoardCells(parsed.config ?? DEFAULT_SEASON_CONFIG);
      if (cells.length > 0) {
        await tx.insert(boardCells).values(
          cells.map((c) => ({
            boardId: newBoard!.id,
            position: c.position,
            cellType: c.cellType,
            label: c.label,
            config: c.config,
          })),
        );
      }
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
    log.debug("season.status_change.invalid_transition", { actorId: actor.id, seasonId, from: season.status, to: newStatus });
    throw new AdminError("adminInvalidTransition", { from: season.status, to: newStatus });
  }
  if (newStatus === "active") {
    const activeRow = await db.select({ id: seasons.id, title: seasons.title }).from(seasons).where(and(eq(seasons.status, "active"), ne(seasons.id, seasonId))).limit(1);
    if (activeRow[0]) {
      log.debug("season.status_change.active_blocked", { actorId: actor.id, seasonId, activeSeasonId: activeRow[0].id });
      throw new AdminError("adminActiveSeasonExists", { title: activeRow[0].title });
    }
  }
  await db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === "active") patch.startedAt = new Date();
    if (newStatus === "finished") patch.finishedAt = new Date();
    await tx.update(seasons).set(patch).where(eq(seasons.id, seasonId));
    if (newStatus === "active") {
      await tx.update(seasonPlayers).set({ position: 0, balancePoints: 0, streakPass: 0, streakDrop: 0 }).where(eq(seasonPlayers.seasonId, seasonId));
    }
  });
  await logAdminAction({ actorId: actor.id, actionType: `season_status_${newStatus}`, targetType: "season", targetId: seasonId });
  if (newStatus === "active") {
    log.info("season.started", { actorId: actor.id, seasonId });
    await logEvent({ seasonId, eventType: "season_started", payload: {} });
  }
  log.info("season.status_change.persisted", { actorId: actor.id, seasonId, newStatus });
}

export async function resetSeason(seasonId: string): Promise<void> {
  const actor = await requireStaff();
  const season = await getSeasonById(seasonId);
  if (!season) {
    log.debug("season.reset.season_not_found", { actorId: actor.id, seasonId });
    throw new AdminError("adminSeasonNotFound");
  }
  const activeRow = await db.select({ id: seasons.id, title: seasons.title }).from(seasons).where(and(eq(seasons.status, "active"), ne(seasons.id, seasonId))).limit(1);
  if (activeRow[0]) {
    log.debug("season.reset.active_blocked", { actorId: actor.id, seasonId, activeSeasonId: activeRow[0].id });
    throw new AdminError("adminActiveSeasonExists", { title: activeRow[0].title });
  }
  const parsed = SeasonConfigSchema.safeParse(season.config);
  const cfg = parsed.success ? parsed.data : (await import("@/lib/engine")).DEFAULT_SEASON_CONFIG;
  const startingBalance = cfg.points.startingBalance ?? 0;

  await db.transaction(async (tx) => {
    const players = await tx.select({ id: seasonPlayers.id }).from(seasonPlayers).where(eq(seasonPlayers.seasonId, seasonId));
    const ids = players.map((p) => p.id);
    if (ids.length > 0) {
      await tx.delete(rerollRequests).where(inArray(rerollRequests.seasonPlayerId, ids));
      await tx.delete(ledgerEntries).where(inArray(ledgerEntries.seasonPlayerId, ids));
      // IEE runtime state: participants are UPDATEd rather than deleted below,
      // so ON DELETE CASCADE never fires here — clear it explicitly.
      await tx.delete(playerInventory).where(inArray(playerInventory.seasonPlayerId, ids));
      await tx.delete(playerEffects).where(inArray(playerEffects.seasonPlayerId, ids));
      await tx.delete(playerEvents).where(inArray(playerEvents.seasonPlayerId, ids));
      await tx.delete(moves).where(inArray(moves.seasonPlayerId, ids));
      await tx.delete(gameRolls).where(inArray(gameRolls.seasonPlayerId, ids));
      await tx.delete(eventLog).where(eq(eventLog.seasonId, seasonId));
      await tx.update(seasonPlayers).set({ position: 0, balancePoints: startingBalance, streakPass: 0, streakDrop: 0, rerollsUsed: 0, rollSeq: 0, status: "active" }).where(eq(seasonPlayers.seasonId, seasonId));
    } else {
      await tx.delete(eventLog).where(eq(eventLog.seasonId, seasonId));
    }
    await tx.update(seasons).set({ status: "active", startedAt: new Date(), finishedAt: null }).where(eq(seasons.id, seasonId));
  });

  await logAdminAction({ actorId: actor.id, actionType: "season_reset", targetType: "season", targetId: seasonId });
  await logEvent({ seasonId, eventType: "season_reset", payload: { by: actor.id } });
  log.info("season.reset.persisted", { actorId: actor.id, seasonId });
}

export async function updateSeasonSettings(input: { seasonId: string; config: unknown; rulesMd?: string | null }): Promise<void> {
  const actor = await requireStaff();
  let config = SeasonConfigSchema.parse(input.config);
  if (config.gamePool.source !== "catalog" && config.gamePool.provider === "internal") {
    throw new AdminError("adminGamePoolProviderRequired");
  }
  // A payload that never mentions `iee` must not wipe the season's pool:
  // SeasonConfigSchema would fill in the empty default and the whole config is
  // replaced below. Absent means "leave it alone", not "clear it".
  const rawInput = input.config as Record<string, unknown> | null;
  const ieeOmitted =
    typeof rawInput !== "object" || rawInput === null || !("iee" in rawInput);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ status: seasons.status, config: seasons.config })
      .from(seasons)
      .where(eq(seasons.id, input.seasonId))
      .limit(1);

    if (ieeOmitted && before) {
      const prev = SeasonConfigSchema.safeParse(before.config);
      if (prev.success) config = { ...config, iee: prev.data.iee };
    }

    await tx.update(seasons).set({ config, ...(input.rulesMd !== undefined ? { rulesMd: input.rulesMd } : {}) }).where(eq(seasons.id, input.seasonId));

    const [existingBoard] = await tx.select().from(boards).where(eq(boards.seasonId, input.seasonId)).limit(1);
    let boardId = existingBoard?.id;

    // A draft season is still being set up, so its layout follows the config
    // automatically. A season that has already started keeps its board unless
    // the admin explicitly asks to regenerate — players stand on those cells.
    let autoRegenerate = false;
    if (before?.status === "draft") {
      const prev = SeasonConfigSchema.safeParse(before.config);
      const prevBoard = prev.success ? prev.data.board : null;
      if (boardShapeChanged(prevBoard, config.board)) {
        autoRegenerate = true;
      } else if (boardId) {
        const rows = await tx.select({ cellType: boardCells.cellType }).from(boardCells).where(eq(boardCells.boardId, boardId));
        autoRegenerate = !boardMatchesConfig(config, rows.map((r) => r.cellType));
      } else {
        autoRegenerate = true;
      }
    }

    if (config.board.regenerateOnSave || autoRegenerate) {
      if (!boardId) {
        const [created] = await tx.insert(boards).values({ seasonId: input.seasonId }).returning({ id: boards.id });
        boardId = created!.id;
      }
      await tx.delete(boardCells).where(eq(boardCells.boardId, boardId));
      const cells = generateBoardCells(config);
      if (cells.length > 0) {
        await tx.insert(boardCells).values(cells.map((c) => ({ boardId: boardId!, position: c.position, cellType: c.cellType, label: c.label, config: c.config })));
      }
      if (config.board.regenerateOnSave) {
        const withoutRegen = { ...config, board: { ...config.board, regenerateOnSave: false } };
        await tx.update(seasons).set({ config: withoutRegen }).where(eq(seasons.id, input.seasonId));
      }
    }
  });
  log.info("season.settings.update.persisted", { actorId: actor.id, seasonId: input.seasonId });
  await logAdminAction({ actorId: actor.id, actionType: "season_settings_updated", targetType: "season", targetId: input.seasonId, payload: { config } });
}
