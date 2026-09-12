import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { boardCells, boards, gameRolls, gamesCatalog, seasonPlayers, seasons, type CatalogGame } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine";
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

/**
 * Picks a random game for a roll: excludes blacklisted games and games
 * already rolled for this player in the current season.
 * Respects SeasonConfig.gamePool filters and optionally fetches from external provider.
 * When board.perCellGenre is enabled, overrides genres filter with the current cell's genres.
 */
export async function rollRandomGame(seasonPlayerId: string): Promise<CatalogGame | null> {
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

  const pickRandom = <T>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)]! : null);

  // ---- catalog source: purely local, filtered ----
  if (pool.source === "catalog") {
    const candidates = await db
      .select()
      .from(gamesCatalog)
      .where(whereClause as never)
      .orderBy(orderExpr as never)
      .limit(pool.maxCandidates);
    if (candidates.length > 0) return pickRandom(candidates)!;
    // No filtered candidates — respect filters and signal empty pool instead of returning
    // an unrelated random game that violates the configured filters.
    return null;
  }

  // ---- api source: exclusively external, dynamically filtered ----
  if (pool.source === "api") {
    if (pool.provider === "internal") {
      // Misconfigured: no external provider selected. Treat as empty rather than
      // silently falling back to manual catalog which would violate "api only".
      // If fallback is enabled, we can still try a filtered catalog lookup.
      if (pool.catalog.fallbackToCatalog) {
        const fallback = await db
          .select()
          .from(gamesCatalog)
          .where(whereClause as never)
          .orderBy(orderExpr as never)
          .limit(pool.maxCandidates);
        if (fallback.length > 0) return pickRandom(fallback)!;
      }
      return null;
    }

    try {
      const { getProvider } = await import("@/lib/modules/catalog/providers");
      const provider = getProvider(pool.provider);
      const external = await provider.search({ filters, pageSize: pool.maxCandidates, cacheTtlHours: pool.cacheTtlHours });

      if (external.length === 0) {
        if (pool.catalog.fallbackToCatalog) {
          const fallback = await db
            .select()
            .from(gamesCatalog)
            .where(whereClause as never)
            .orderBy(orderExpr as never)
            .limit(pool.maxCandidates);
          if (fallback.length > 0) return pickRandom(fallback)!;
        }
        return null;
      }

      // Exclude games already played by this player (match by title or externalRawId)
      let playedTitles = new Set<string>();
      let playedExternalIds = new Set<string>();
      if (playedIds.length > 0) {
        const playedRows = await db
          .select({ title: gamesCatalog.title, externalRawId: gamesCatalog.externalRawId })
          .from(gamesCatalog)
          .where(inArray(gamesCatalog.id, playedIds));
        playedTitles = new Set(playedRows.map((r) => r.title.trim().toLowerCase()));
        playedExternalIds = new Set(playedRows.map((r) => r.externalRawId).filter((v): v is string => Boolean(v)));
      }

      const unplayed = external.filter(
        (ext) => !playedTitles.has(ext.title.trim().toLowerCase()) && !playedExternalIds.has(ext.externalId),
      );

      const poolToPick = unplayed.length > 0 ? unplayed : [];
      if (poolToPick.length === 0) {
        if (pool.catalog.fallbackToCatalog) {
          const fallback = await db
            .select()
            .from(gamesCatalog)
            .where(whereClause as never)
            .orderBy(orderExpr as never)
            .limit(pool.maxCandidates);
          if (fallback.length > 0) return pickRandom(fallback)!;
        }
        return null;
      }

      // Upsert external games into catalog for history, but the roll is picked
      // directly from the filtered external set — not from a re-queried catalog
      // that would mix in manual entries.
      const chosen = pickRandom(poolToPick)!;

      // Ensure other unplayed external games are cached as well (best-effort)
      for (const ext of poolToPick) {
        if (ext.externalId === chosen.externalId) continue;
        const exists = await db
          .select({ id: gamesCatalog.id })
          .from(gamesCatalog)
          .where(and(eq(gamesCatalog.externalRawId, ext.externalId), eq(gamesCatalog.externalSource, pool.provider)) as never)
          .limit(1);
        if (exists.length === 0) {
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

      // Try to reuse existing catalog row for chosen (idempotent)
      const existingChosen = await db
        .select()
        .from(gamesCatalog)
        .where(and(eq(gamesCatalog.externalRawId, chosen.externalId), eq(gamesCatalog.externalSource, pool.provider)) as never)
        .limit(1);
      if (existingChosen.length > 0 && !existingChosen[0]!.isBlacklisted) {
        // Double-check it hasn't been played in the meantime
        if (!playedIds.includes(existingChosen[0]!.id)) return existingChosen[0] as CatalogGame;
      }
      if (existingChosen.length > 0 && existingChosen[0]!.isBlacklisted) {
        // Blacklisted -> try another candidate
        const remaining = poolToPick.filter((e) => e.externalId !== chosen.externalId);
        if (remaining.length > 0) {
          const alt = pickRandom(remaining)!;
          const altExisting = await db
            .select()
            .from(gamesCatalog)
            .where(and(eq(gamesCatalog.externalRawId, alt.externalId), eq(gamesCatalog.externalSource, pool.provider)) as never)
            .limit(1);
          if (altExisting.length > 0 && !altExisting[0]!.isBlacklisted && !playedIds.includes(altExisting[0]!.id)) return altExisting[0] as CatalogGame;
          const [altInserted] = await db
            .insert(gamesCatalog)
            .values({
              title: alt.title,
              genres: alt.genres,
              tags: alt.tags,
              platform: alt.platforms[0] ?? null,
              coverUrl: alt.coverUrl,
              metacritic: alt.metacritic,
              rating: alt.rating != null ? String(alt.rating) : null,
              releasedAt: alt.releasedAt ? new Date(alt.releasedAt) : null,
              esrb: alt.esrb,
              externalSource: pool.provider,
              externalRawId: alt.externalId,
              externalIds: { provider: pool.provider, raw: alt.externalId },
              description: alt.description ?? null,
              playtimeHours: alt.playtimeHours ?? null,
              stores: alt.stores ?? [],
              website: alt.website ?? null,
            } as never)
            .returning();
          return altInserted as CatalogGame;
        }
        return null;
      }

      // Insert chosen if not already present
      if (existingChosen.length === 0) {
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
        return inserted as CatalogGame;
      }
      return existingChosen[0] as CatalogGame;
    } catch (e) {
      console.warn("[rollRandomGame] provider fetch failed", e);
      if (pool.catalog.fallbackToCatalog) {
        const fallback = await db
          .select()
          .from(gamesCatalog)
          .where(whereClause as never)
          .orderBy(orderExpr as never)
          .limit(pool.maxCandidates);
        if (fallback.length > 0) return pickRandom(fallback)!;
      }
      return null;
    }
  }

  // ---- hybrid source: catalog + api ----
  // Try local filtered pool first, but allow api fetch to augment it
  let candidates: CatalogGame[] = [];
  candidates = await db
    .select()
    .from(gamesCatalog)
    .where(whereClause as never)
    .orderBy(orderExpr as never)
    .limit(pool.maxCandidates);

  if (candidates.length > 0) {
    const pick = pickRandom(candidates)!;
    if (pool.autoFetchOnRoll && pool.provider !== "internal" && Math.random() < 0.5) {
      // fall through to API fetch to mix fresh results
    } else {
      return pick;
    }
  }

  if (pool.provider !== "internal") {
    try {
      const { getProvider } = await import("@/lib/modules/catalog/providers");
      const provider = getProvider(pool.provider);
      const external = await provider.search({ filters, pageSize: pool.maxCandidates, cacheTtlHours: pool.cacheTtlHours });
      if (external.length > 0) {
        // Cache external results
        for (const ext of external) {
          const exists = await db
            .select({ id: gamesCatalog.id })
            .from(gamesCatalog)
            .where(and(eq(gamesCatalog.externalRawId, ext.externalId), eq(gamesCatalog.externalSource, pool.provider)) as never)
            .limit(1);
          if (exists.length === 0) {
            // Avoid duplicate titles blocking hybrid inserts — hybrid intentionally merges,
            // but we still prevent exact title+genre clashes from spamming duplicates.
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
          return pickRandom(refreshed)!;
        }
      }
    } catch (e) {
      console.warn("[rollRandomGame] provider fetch failed", e);
      if (candidates.length > 0) return pickRandom(candidates)!;
    }
  }

  if (candidates.length > 0) return pickRandom(candidates)!;
  // No unfiltered fallback — respect filters. If nothing matched, surface empty pool.
  return null;
}
