import { and, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  gameRolls,
  gamesCatalog,
  rerollRequests,
  seasonPlayers,
  seasons,
  users,
  type CatalogGame,
  type GameRoll,
  type RerollRequest,
} from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/game-engine";
import type { SeasonConfig } from "@/game-engine/types";

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

export async function listCatalogGames(): Promise<CatalogGame[]> {
  return db.select().from(gamesCatalog).orderBy(gamesCatalog.title);
}

export async function getCatalogPreview(limit = 18): Promise<CatalogGame[]> {
  return db
    .select()
    .from(gamesCatalog)
    .where(eq(gamesCatalog.isBlacklisted, false))
    .orderBy(sql`random()`)
    .limit(limit);
}

export async function addCatalogGame(game: {
  title: string;
  platform?: string | null;
  coverUrl?: string | null;
  genres?: string[];
  tags?: string[];
  metacritic?: number | null;
  rating?: number | null;
  releasedAt?: Date | null;
  esrb?: string | null;
  externalSource?: string | null;
  externalRawId?: string | null;
  externalIds?: Record<string, unknown>;
}): Promise<CatalogGame> {
  const [created] = await db
    .insert(gamesCatalog)
    .values({
      title: game.title,
      platform: game.platform ?? null,
      coverUrl: game.coverUrl ?? null,
      genres: game.genres ?? [],
      tags: game.tags ?? [],
      metacritic: game.metacritic ?? null,
      rating: game.rating != null ? String(game.rating) : null,
      releasedAt: game.releasedAt ?? null,
      esrb: game.esrb ?? null,
      externalSource: game.externalSource ?? null,
      externalRawId: game.externalRawId ?? null,
      externalIds: game.externalIds ?? {},
    } as never)
    .returning();
  return created!;
}

export async function setGameBlacklisted(
  gameId: string,
  blacklisted: boolean,
): Promise<void> {
  await db
    .update(gamesCatalog)
    .set({ isBlacklisted: blacklisted })
    .where(eq(gamesCatalog.id, gameId));
}

export async function deleteCatalogGame(gameId: string): Promise<void> {
  await db.delete(gamesCatalog).where(eq(gamesCatalog.id, gameId));
}

/**
 * Picks a random game for a roll: excludes blacklisted games and games
 * already rolled for this player in the current season.
 * Respects SeasonConfig.gamePool filters (genres, platforms, metacritic, rating, year, tags,
 * search, esrb, onlyWithCover, ordering) and optionally fetches from external provider
 * when source is api/hybrid.
 */
export async function rollRandomGame(
  seasonPlayerId: string,
): Promise<CatalogGame | null> {
  const played = await db
    .select({ gameId: gameRolls.gameId })
    .from(gameRolls)
    .where(eq(gameRolls.seasonPlayerId, seasonPlayerId));
  const playedIds = played
    .map((r) => r.gameId)
    .filter((id): id is string => id !== null);

  const config = (await fetchSeasonConfig(seasonPlayerId)) ?? DEFAULT_SEASON_CONFIG;
  const pool = config.gamePool;
  const filters = pool.filters;

  // Build dynamic SQL conditions for catalog
  const conditions: ReturnType<typeof eq>[] = [];
  // blacklist
  conditions.push(eq(gamesCatalog.isBlacklisted, false) as never);
  if (playedIds.length > 0) {
    conditions.push(notInArray(gamesCatalog.id, playedIds) as never);
  }
  // Only add filter conditions when pool is not empty — keeps empty pool meaning "all"
  // We use raw sql for array overlap where drizzle lacks helpers.
  const extraSql: ReturnType<typeof sql>[] = [];
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
    // platform is single text column — match any
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

  const whereClause =
    extraSql.length > 0
      ? and(...(conditions as never[]), ...extraSql)
      : and(...(conditions as never[]));

  // Determine ordering — respect pool ordering when catalog mode
  let orderExpr: ReturnType<typeof sql> = sql`random()`;
  if (filters.ordering === "-metacritic") orderExpr = sql`${gamesCatalog.metacritic} DESC NULLS LAST, random()`;
  else if (filters.ordering === "metacritic") orderExpr = sql`${gamesCatalog.metacritic} ASC NULLS LAST, random()`;
  else if (filters.ordering === "-rating") orderExpr = sql`${gamesCatalog.rating}::numeric DESC NULLS LAST, random()`;
  else if (filters.ordering === "-released") orderExpr = sql`${gamesCatalog.releasedAt} DESC NULLS LAST, random()`;
  else if (filters.ordering === "name") orderExpr = sql`lower(${gamesCatalog.title}) ASC`;
  else if (filters.ordering === "-name") orderExpr = sql`lower(${gamesCatalog.title}) DESC`;

  // Try catalog first when source is catalog or hybrid
  let candidates: CatalogGame[] = [];
  if (pool.source === "catalog" || pool.source === "hybrid") {
    candidates = await db
      .select()
      .from(gamesCatalog)
      .where(whereClause as never)
      .orderBy(orderExpr)
      .limit(pool.maxCandidates);
    // Pick one randomly from the limited set to keep random while respecting ordering weight
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
      // For hybrid with autoFetchOnRoll, we still give chance to fetch fresh API game
      if (pool.source === "hybrid" && pool.autoFetchOnRoll && pool.provider !== "internal" && Math.random() < 0.5) {
        // fall through to API fetch attempt
      } else {
        return pick;
      }
    }
  }

  // For api or hybrid fallback, try external provider
  if (pool.source === "api" || pool.source === "hybrid") {
    if (pool.provider !== "internal") {
      try {
        const { getProvider } = await import("@/lib/game-providers");
        const provider = getProvider(pool.provider);
        const external = await provider.search({ filters, pageSize: pool.maxCandidates });
        if (external.length > 0) {
          // Upsert external games into catalog (idempotent on externalRawId+source)
          for (const ext of external) {
            const exists = await db
              .select({ id: gamesCatalog.id })
              .from(gamesCatalog)
              .where(
                and(
                  eq(gamesCatalog.externalRawId, ext.externalId),
                  eq(gamesCatalog.externalSource, pool.provider),
                ) as never,
              )
              .limit(1);
            if (exists.length === 0 && !playedIds.includes(ext.externalId)) {
              // check title duplicate to avoid spamming
              const titleDup = await db
                .select({ id: gamesCatalog.id })
                .from(gamesCatalog)
                .where(eq(gamesCatalog.title, ext.title))
                .limit(1);
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
                } as never);
              }
            }
          }
          // Now re-query with filter to pick one that matches and hasn't been played
          const refreshed = await db
            .select()
            .from(gamesCatalog)
            .where(whereClause as never)
            .orderBy(orderExpr)
            .limit(pool.maxCandidates);
          if (refreshed.length > 0) {
            return refreshed[Math.floor(Math.random() * refreshed.length)]!;
          }
          // If still none, return a direct external game mapped to CatalogGame shape without persisting played check
          const unplayedExternal = external.filter(() => {
            // already filtered via playedIds check above for catalog, but allow any external here
            return true;
          });
          if (unplayedExternal.length > 0) {
            const chosen = unplayedExternal[Math.floor(Math.random() * unplayedExternal.length)]!;
            // Persist chosen immediately so game_rolls FK is valid
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
              } as never)
              .returning();
            return inserted as CatalogGame;
          }
        }
      } catch (e) {
        console.warn("[rollRandomGame] provider fetch failed", e);
        // fallback to catalog if allowed
        if (pool.catalog.fallbackToCatalog && candidates.length > 0) {
          return candidates[Math.floor(Math.random() * candidates.length)]!;
        }
      }
    }
    // api source but provider not configured or returned nothing: fallback to catalog if hybrid
    if (pool.source === "api" && pool.catalog.fallbackToCatalog) {
      const fallback = await db
        .select()
        .from(gamesCatalog)
        .where(and(eq(gamesCatalog.isBlacklisted, false) as never, ...(playedIds.length ? [notInArray(gamesCatalog.id, playedIds) as never] : [])))
        .orderBy(sql`random()`)
        .limit(1);
      return fallback[0] ?? null;
    }
  }

  // final fallback: any unplayed non-blacklisted game
  if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)]!;
  const anyFallback = await db
    .select()
    .from(gamesCatalog)
    .where(and(eq(gamesCatalog.isBlacklisted, false) as never, ...(playedIds.length ? [notInArray(gamesCatalog.id, playedIds) as never] : [])))
    .orderBy(sql`random()`)
    .limit(1);
  if (anyFallback[0]) return anyFallback[0];
  // All games have been played — allow replay of any non-blacklisted game
  if (playedIds.length > 0) {
    const replayFallback = await db
      .select()
      .from(gamesCatalog)
      .where(eq(gamesCatalog.isBlacklisted, false) as never)
      .orderBy(sql`random()`)
      .limit(1);
    return replayFallback[0] ?? null;
  }
  return null;
}

export async function getGameById(id: string): Promise<CatalogGame | null> {
  const rows = await db
    .select()
    .from(gamesCatalog)
    .where(eq(gamesCatalog.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// --- Rolls ----------------------------------------------------------------

export async function createRoll(
  seasonPlayerId: string,
  gameId: string | null,
): Promise<GameRoll> {
  const [created] = await db
    .insert(gameRolls)
    .values({ seasonPlayerId, gameId, status: "rolled" })
    .returning();
  return created!;
}

/** The player's current unfinished roll (rolled or in_progress). */
export async function getOpenRoll(
  seasonPlayerId: string,
): Promise<(GameRoll & { game: CatalogGame | null }) | null> {
  const rows = await db
    .select({ roll: gameRolls, game: gamesCatalog })
    .from(gameRolls)
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(
      and(
        eq(gameRolls.seasonPlayerId, seasonPlayerId),
        or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")),
        isNull(gameRolls.resolvedAt),
      ),
    )
    .orderBy(sql`${gameRolls.rolledAt} desc`)
    .limit(1);
  const row = rows[0];
  return row ? { ...row.roll, game: row.game } : null;
}

export async function updateRollStatus(
  rollId: string,
  status: GameRoll["status"],
): Promise<void> {
  const patch: Partial<GameRoll> = { status };
  if (status !== "rolled" && status !== "in_progress") patch.resolvedAt = new Date();
  await db.update(gameRolls).set(patch).where(eq(gameRolls.id, rollId));
}

export async function countRerollsForGame(
  seasonPlayerId: string,
  gameId: string | null,
): Promise<number> {
  if (!gameId) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gameRolls)
    .where(
      and(
        eq(gameRolls.seasonPlayerId, seasonPlayerId),
        eq(gameRolls.gameId, gameId),
        eq(gameRolls.status, "rerolled"),
      ),
    );
  return rows[0]?.n ?? 0;
}

// --- Reroll requests -------------------------------------------------------

export async function createRerollRequest(
  seasonPlayerId: string,
  gameRollId: string,
  reason: string,
): Promise<RerollRequest> {
  const [created] = await db
    .insert(rerollRequests)
    .values({ seasonPlayerId, gameRollId, reason, status: "pending" })
    .returning();
  return created!;
}

export async function getPendingRerollForRoll(
  gameRollId: string,
): Promise<RerollRequest | null> {
  const rows = await db
    .select()
    .from(rerollRequests)
    .where(
      and(eq(rerollRequests.gameRollId, gameRollId), eq(rerollRequests.status, "pending")),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getPendingRerollForPlayer(
  seasonPlayerId: string,
): Promise<RerollRequest | null> {
  const rows = await db
    .select()
    .from(rerollRequests)
    .where(
      and(
        eq(rerollRequests.seasonPlayerId, seasonPlayerId),
        eq(rerollRequests.status, "pending"),
      ),
    )
    .orderBy(desc(rerollRequests.requestedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRerollRequestById(id: string): Promise<RerollRequest | null> {
  const rows = await db.select().from(rerollRequests).where(eq(rerollRequests.id, id)).limit(1);
  return rows[0] ?? null;
}

export type PendingRerollRow = RerollRequest & {
  username: string;
  displayName: string | null;
  gameTitle: string | null;
  seasonTitle: string | null;
};

export async function listPendingRerollRequests(): Promise<PendingRerollRow[]> {
  const rows = await db
    .select({
      request: rerollRequests,
      username: users.username,
      displayName: users.displayName,
      gameTitle: gamesCatalog.title,
      seasonTitle: sql<string | null>`(select title from seasons where id = ${seasonPlayers.seasonId})`,
    })
    .from(rerollRequests)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, rerollRequests.seasonPlayerId))
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .leftJoin(gameRolls, eq(gameRolls.id, rerollRequests.gameRollId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(rerollRequests.status, "pending"))
    .orderBy(desc(rerollRequests.requestedAt));
  return rows.map((r) => ({
    ...r.request,
    username: r.username,
    displayName: r.displayName,
    gameTitle: r.gameTitle ?? null,
    seasonTitle: r.seasonTitle ?? null,
  }));
}

export async function getRecentRolls(
  seasonPlayerId: string,
  limit = 10,
): Promise<Array<GameRoll & { game: CatalogGame | null }>> {
  const rows = await db
    .select({ roll: gameRolls, game: gamesCatalog })
    .from(gameRolls)
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(gameRolls.seasonPlayerId, seasonPlayerId))
    .orderBy(desc(gameRolls.rolledAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.roll, game: r.game }));
}

