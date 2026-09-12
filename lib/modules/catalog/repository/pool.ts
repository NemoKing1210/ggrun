import { and, eq, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { boardCells, boards, gameRolls, gamesCatalog, seasonPlayers, seasons, type CatalogGame } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, POOL_EMPTY_ERROR, SeasonConfigSchema, type PoolEmptyReason } from "@/lib/engine";
import type { SeasonConfig } from "@/lib/engine/types";

function parseSeasonConfig(raw: unknown): SeasonConfig {
  const parsed = SeasonConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
}

async function fetchSeasonConfig(seasonPlayerId: string): Promise<SeasonConfig | null> {
  const row = await db
    .select({ config: seasons.config })
    .from(seasonPlayers)
    .innerJoin(seasons, eq(seasonPlayers.seasonId, seasons.id))
    .where(eq(seasonPlayers.id, seasonPlayerId))
    .limit(1);
  if (!row[0]) return null;
  return parseSeasonConfig(row[0].config);
}

async function resolveEffectiveFilters(seasonPlayerId: string, config: SeasonConfig) {
  const base = config.gamePool.filters;
  if (!config.board.perCellGenre) return base;
  try {
    const spRows = await db.select({ position: seasonPlayers.position, seasonId: seasonPlayers.seasonId }).from(seasonPlayers).where(eq(seasonPlayers.id, seasonPlayerId)).limit(1);
    const sp = spRows[0];
    if (!sp) return base;
    const boardRows = await db.select({ id: boards.id }).from(boards).where(eq(boards.seasonId, sp.seasonId)).limit(1);
    const board = boardRows[0];
    if (!board) return base;
    const cellRows = await db.select({ config: boardCells.config }).from(boardCells).where(and(eq(boardCells.boardId, board.id), eq(boardCells.position, sp.position))).limit(1);
    const cfg = cellRows[0]?.config as Record<string, unknown> | undefined;
    const g = cfg?.genres;
    if (Array.isArray(g) && g.length > 0) {
      const clean = [...new Set(g.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
      if (clean.length > 0) return { ...base, genres: clean };
    }
  } catch {}
  return base;
}

export type PoolPick =
  | { game: CatalogGame; reason: null }
  | { game: null; reason: PoolEmptyReason };

/**
 * Runs only when the pick has already failed, so two extra counts cost nothing
 * on the path that matters.
 */
async function explainEmptyPool(
  playedIds: readonly string[],
  pool: SeasonConfig["gamePool"],
): Promise<PoolEmptyReason> {
  const totalRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gamesCatalog)
    .where(eq(gamesCatalog.isBlacklisted, false));
  if ((totalRows[0]?.n ?? 0) === 0) return "catalog_empty";

  if (playedIds.length > 0) {
    const unplayedRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(gamesCatalog)
      .where(
        and(
          eq(gamesCatalog.isBlacklisted, false),
          notInArray(gamesCatalog.id, [...playedIds]),
        ) as never,
      );
    if ((unplayedRows[0]?.n ?? 0) === 0) return "all_played";
  }

  return pool.source !== "catalog" && pool.provider !== "internal"
    ? "provider_empty"
    : "filters_exclude_all";
}

/**
 * Picks a random game for a roll: excludes blacklisted games and games
 * already rolled for this player in the current season.
 * Respects SeasonConfig.gamePool filters and optionally fetches from external provider.
 * When board.perCellGenre is enabled, overrides genres filter with the current cell's genres.
 *
 * Returns *why* it found nothing rather than a bare null. It also no longer
 * quietly hands back a game the participant has already played: the catalog
 * path used to fall through to "any non-blacklisted game at all" once the
 * unplayed ones ran out, so depending on a setting nobody can see, exhausting
 * the pool either repeated a game in silence or failed with a message naming
 * the wrong cause. The README promises that already-played games never come up;
 * that promise is now kept, and running out is reported instead.
 */
export async function pickGameForRoll(seasonPlayerId: string): Promise<PoolPick> {
  const played = await db.select({ gameId: gameRolls.gameId }).from(gameRolls).where(eq(gameRolls.seasonPlayerId, seasonPlayerId));
  const playedIds = played.map((r) => r.gameId).filter((id): id is string => id !== null);

  const config = (await fetchSeasonConfig(seasonPlayerId)) ?? DEFAULT_SEASON_CONFIG;
  const pool = config.gamePool;
  const filters = await resolveEffectiveFilters(seasonPlayerId, config);

  const conditions: unknown[] = [];
  conditions.push(eq(gamesCatalog.isBlacklisted, false) as never);
  if (playedIds.length > 0) {
    conditions.push(notInArray(gamesCatalog.id, playedIds) as never);
  }

  const extraSql: unknown[] = [];
  if (filters.genres.length) {
    extraSql.push(sql`${gamesCatalog.genres} && ARRAY[${sql.join(
      filters.genres.map((g) => sql`${g}`),
      sql`, `,
    )}]::text[]` as never);
  }
  if (filters.tags.length) {
    extraSql.push(sql`${gamesCatalog.tags} && ARRAY[${sql.join(
      filters.tags.map((t) => sql`${t}`),
      sql`, `,
    )}]::text[]` as never);
  }
  if (filters.platforms.length) {
    extraSql.push(sql`${gamesCatalog.platform} = ANY(ARRAY[${sql.join(
      filters.platforms.map((p) => sql`${p}`),
      sql`, `,
    )}]::text[])` as never);
  }
  if (filters.esrb.length) {
    extraSql.push(sql`${gamesCatalog.esrb} = ANY(ARRAY[${sql.join(
      filters.esrb.map((e) => sql`${e}`),
      sql`, `,
    )}]::text[])` as never);
  }
  if (filters.searchQuery && filters.searchQuery.trim().length) {
    const q = `%${filters.searchQuery.trim().toLowerCase()}%`;
    extraSql.push(sql`lower(${gamesCatalog.title}) LIKE ${q}` as never);
  }
  if (filters.onlyWithCover) {
    extraSql.push(sql`${gamesCatalog.coverUrl} IS NOT NULL AND ${gamesCatalog.coverUrl} <> ''` as never);
  }
  if (filters.metacriticMin !== null) {
    extraSql.push(sql`${gamesCatalog.metacritic} >= ${filters.metacriticMin}` as never);
  }
  if (filters.metacriticMax !== null) {
    extraSql.push(sql`${gamesCatalog.metacritic} <= ${filters.metacriticMax}` as never);
  }
  if (filters.ratingMin !== null) {
    extraSql.push(sql`${gamesCatalog.rating}::numeric >= ${filters.ratingMin}` as never);
  }
  if (filters.ratingMax !== null) {
    extraSql.push(sql`${gamesCatalog.rating}::numeric <= ${filters.ratingMax}` as never);
  }
  if (filters.yearMin !== null) {
    extraSql.push(sql`EXTRACT(YEAR FROM ${gamesCatalog.releasedAt}) >= ${filters.yearMin}` as never);
  }
  if (filters.yearMax !== null) {
    extraSql.push(sql`EXTRACT(YEAR FROM ${gamesCatalog.releasedAt}) <= ${filters.yearMax}` as never);
  }

  const whereClause = extraSql.length > 0 ? and(...(conditions as never[]), ...extraSql as never[]) : and(...(conditions as never[]));

  let orderExpr: unknown = sql`random()`;
  if (filters.ordering === "-metacritic") orderExpr = sql`${gamesCatalog.metacritic} DESC NULLS LAST, random()`;
  else if (filters.ordering === "metacritic") orderExpr = sql`${gamesCatalog.metacritic} ASC NULLS LAST, random()`;
  else if (filters.ordering === "-rating") orderExpr = sql`${gamesCatalog.rating}::numeric DESC NULLS LAST, random()`;
  else if (filters.ordering === "-released") orderExpr = sql`${gamesCatalog.releasedAt} DESC NULLS LAST, random()`;
  else if (filters.ordering === "name") orderExpr = sql`lower(${gamesCatalog.title}) ASC`;
  else if (filters.ordering === "-name") orderExpr = sql`lower(${gamesCatalog.title}) DESC`;

  // ---- catalog + hybrid: local filtered pool first ----
  let candidates: CatalogGame[] = [];
  if (pool.source === "catalog" || pool.source === "hybrid") {
    candidates = await db
      .select()
      .from(gamesCatalog)
      .where(whereClause as never)
      .orderBy(orderExpr as never)
      .limit(pool.maxCandidates);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
      if (pool.source === "hybrid" && pool.autoFetchOnRoll && pool.provider !== "internal" && Math.random() < 0.5) {
        // fall through to API fetch attempt
      } else {
        return { game: pick, reason: null };
      }
    }
  }

  if (pool.source === "api" || pool.source === "hybrid") {
    if (pool.provider !== "internal") {
      try {
        const { getProvider } = await import("@/lib/modules/catalog/providers");
        const provider = getProvider(pool.provider);
        const external = await provider.search({ filters, pageSize: pool.maxCandidates, cacheTtlHours: pool.cacheTtlHours });
        if (external.length > 0) {
          for (const ext of external) {
            const exists = await db
              .select({ id: gamesCatalog.id })
              .from(gamesCatalog)
              .where(and(eq(gamesCatalog.externalRawId, ext.externalId), eq(gamesCatalog.externalSource, pool.provider)) as never)
              .limit(1);
            // `playedIds` holds catalog UUIDs and `ext.externalId` is the
            // provider's own id, so the second half of this condition was
            // always true. Dropped rather than "fixed": an external result the
            // player has already had is filtered by the catalog query below,
            // once the row exists.
            if (exists.length === 0) {
              const titleDup = await db.select({ id: gamesCatalog.id }).from(gamesCatalog).where(eq(gamesCatalog.title, ext.title)).limit(1);
              if (titleDup.length === 0) {
                await db.insert(gamesCatalog).values({
                  title: ext.title,
                  genres: ext.genres,
                  tags: ext.tags,
                  platform: ext.platforms[0] ?? null,
                  coverUrl: ext.coverUrl,
                  metacritic: ext.metacritic,
                  rating: ext.rating != null ? String(ext.rating) : null,
                  releasedAt: ext.releasedAt ? new Date(ext.releasedAt) : null,
                  esrb: ext.esrb,
                  externalSource: pool.provider,
                  externalRawId: ext.externalId,
                  externalIds: { provider: pool.provider, raw: ext.externalId },
                  description: ext.description ?? null,
                  playtimeHours: ext.playtimeHours ?? null,
                  stores: ext.stores ?? [],
                  website: ext.website ?? null,
                } as never);
              }
            }
          }
          const refreshed = await db.select().from(gamesCatalog).where(whereClause as never).orderBy(orderExpr as never).limit(pool.maxCandidates);
          if (refreshed.length > 0) {
            return { game: refreshed[Math.floor(Math.random() * refreshed.length)]!, reason: null };
          }
          // Was `external.filter(() => true)` under the name `unplayedExternal`
          // — a filter that filtered nothing, which is worse than none because
          // the name claims otherwise. Nothing here can be "unplayed" or not:
          // these rows are not in the catalog yet.
          if (external.length > 0) {
            const chosen = external[Math.floor(Math.random() * external.length)]!;
            const [inserted] = await db
              .insert(gamesCatalog)
              .values({
                title: chosen.title,
                genres: chosen.genres,
                tags: chosen.tags,
                platform: chosen.platforms[0] ?? null,
                coverUrl: chosen.coverUrl,
                metacritic: chosen.metacritic,
                rating: chosen.rating != null ? String(chosen.rating) : null,
                releasedAt: chosen.releasedAt ? new Date(chosen.releasedAt) : null,
                esrb: chosen.esrb,
                externalSource: pool.provider,
                externalRawId: chosen.externalId,
                externalIds: { provider: pool.provider, raw: chosen.externalId },
                description: chosen.description ?? null,
                playtimeHours: chosen.playtimeHours ?? null,
                stores: chosen.stores ?? [],
                website: chosen.website ?? null,
              } as never)
              .returning();
            return { game: inserted as CatalogGame, reason: null };
          }
        }
      } catch (e) {
        console.warn("[rollRandomGame] provider fetch failed", e);
        if (pool.catalog.fallbackToCatalog && candidates.length > 0) {
          return { game: candidates[Math.floor(Math.random() * candidates.length)]!, reason: null };
        }
      }
    }
    if (pool.source === "api" && pool.catalog.fallbackToCatalog) {
      const fallback = await db
        .select()
        .from(gamesCatalog)
        .where(and(eq(gamesCatalog.isBlacklisted, false) as never, ...(playedIds.length ? [notInArray(gamesCatalog.id, playedIds) as never] : [])))
        .orderBy(sql`random()`)
        .limit(1);
      if (fallback[0]) return { game: fallback[0], reason: null };
      return { game: null, reason: await explainEmptyPool(playedIds, pool) };
    }
  }

  const allowCatalogFallback = pool.catalog.fallbackToCatalog || pool.source === "catalog" || pool.source === "hybrid";
  if (candidates.length > 0) {
    return { game: candidates[Math.floor(Math.random() * candidates.length)]!, reason: null };
  }
  if (pool.source === "api" && !pool.catalog.fallbackToCatalog) {
    return { game: null, reason: await explainEmptyPool(playedIds, pool) };
  }
  if (!allowCatalogFallback) {
    return { game: null, reason: await explainEmptyPool(playedIds, pool) };
  }

  // Last resort: ignore the season's filters, but never the two rules that are
  // not filters — a blacklisted game and a game this participant has already
  // been given. There used to be one more step after this one, handing back any
  // non-blacklisted game at all, played or not. That is what made "already
  // played games never come up" untrue, and it was invisible: the player was
  // simply handed something familiar and nobody was told the pool had run dry.
  const anyFallback = await db
    .select()
    .from(gamesCatalog)
    .where(and(eq(gamesCatalog.isBlacklisted, false) as never, ...(playedIds.length ? [notInArray(gamesCatalog.id, playedIds) as never] : [])))
    .orderBy(sql`random()`)
    .limit(1);
  if (anyFallback[0]) return { game: anyFallback[0], reason: null };

  return { game: null, reason: await explainEmptyPool(playedIds, pool) };
}

/**
 * Back-compatible shape for callers that only need the game.
 * Prefer `pickGameForRoll`, which says why when there is none.
 */
export async function rollRandomGame(seasonPlayerId: string): Promise<CatalogGame | null> {
  return (await pickGameForRoll(seasonPlayerId)).game;
}

// Re-exported so a caller that already imports the picker gets the codes with
// it; the definitions live in the engine, where the rules live.
export { POOL_EMPTY_ERROR, type PoolEmptyReason };
