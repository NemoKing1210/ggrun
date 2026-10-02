import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { boardCells, boards, gameRolls, gamesCatalog, seasonPlayers, seasons, type CatalogGame } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, POOL_EMPTY_ERROR, SeasonConfigSchema, splitPoolFilters, type PoolEmptyReason } from "@/lib/engine";
import type { SeasonConfig } from "@/lib/engine/types";
import type { ExternalGame } from "@/lib/modules/catalog/providers/provider";

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

/**
 * The season's filters for this participant's roll. `cellLocked` says the
 * genres come from the board cell they stand on (per-cell genre locking) —
 * those stay a requirement even under a primary tag, where the season's own
 * genres only rank.
 */
async function resolveEffectiveFilters(
  seasonPlayerId: string,
  config: SeasonConfig,
): Promise<{ filters: SeasonConfig["gamePool"]["filters"]; cellLocked: boolean }> {
  const base = config.gamePool.filters;
  const unlocked = { filters: base, cellLocked: false };
  if (!config.board.perCellGenre) return unlocked;
  try {
    const spRows = await db.select({ position: seasonPlayers.position, seasonId: seasonPlayers.seasonId }).from(seasonPlayers).where(eq(seasonPlayers.id, seasonPlayerId)).limit(1);
    const sp = spRows[0];
    if (!sp) return unlocked;
    const boardRows = await db.select({ id: boards.id }).from(boards).where(eq(boards.seasonId, sp.seasonId)).limit(1);
    const board = boardRows[0];
    if (!board) return unlocked;
    const cellRows = await db.select({ config: boardCells.config }).from(boardCells).where(and(eq(boardCells.boardId, board.id), eq(boardCells.position, sp.position))).limit(1);
    const cfg = cellRows[0]?.config as Record<string, unknown> | undefined;
    const g = cfg?.genres;
    if (Array.isArray(g) && g.length > 0) {
      const clean = [...new Set(g.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
      if (clean.length > 0) return { filters: { ...base, genres: clean }, cellLocked: true };
    }
  } catch {}
  return unlocked;
}

export type PoolPick =
  | { game: CatalogGame; reason: null }
  | { game: null; reason: PoolEmptyReason };

/**
 * Runs only when the pick has already failed, so two extra counts cost nothing
 * on the path that matters.
 *
 * An API season's pool is what its provider has supplied, not the shared
 * catalog, so that is what is counted for it: a catalog full of demo games says
 * nothing about why the provider's games ran out.
 */
async function explainEmptyPool(
  playedIds: readonly string[],
  pool: SeasonConfig["gamePool"],
): Promise<PoolEmptyReason> {
  const apiOnly = pool.source === "api";
  const inPool = apiOnly
    ? and(eq(gamesCatalog.isBlacklisted, false), eq(gamesCatalog.externalSource, pool.provider))
    : eq(gamesCatalog.isBlacklisted, false);

  const totalRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gamesCatalog)
    .where(inPool as never);
  if ((totalRows[0]?.n ?? 0) === 0) return apiOnly ? "provider_empty" : "catalog_empty";

  if (playedIds.length > 0) {
    const unplayedRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(gamesCatalog)
      .where(and(inPool, notInArray(gamesCatalog.id, [...playedIds])) as never);
    if ((unplayedRows[0]?.n ?? 0) === 0) return "all_played";
  }

  return "filters_exclude_all";
}

/**
 * Adds what a provider returned to the catalog, skipping anything already
 * there: the same provider id, or a game of the same title from anywhere else.
 * Two lookups for the whole batch rather than two per game — this runs on every
 * roll of an API season.
 *
 * A game that is already there still learns from the answer: a request made
 * for a season's filter establishes genres and tags the stored row may not
 * carry yet (FreeToGame names only a game's main genre, and its categories are
 * known only from which request returned it). Those are added, never removed,
 * so a row imported earlier for another season becomes reachable by this one's
 * filter instead of sitting in the catalog unmatched.
 */
async function importExternalGames(external: readonly ExternalGame[], provider: string): Promise<void> {
  if (external.length === 0) return;
  const known = await db
    .select({ id: gamesCatalog.id, rawId: gamesCatalog.externalRawId, genres: gamesCatalog.genres, tags: gamesCatalog.tags })
    .from(gamesCatalog)
    .where(
      and(
        eq(gamesCatalog.externalSource, provider),
        inArray(gamesCatalog.externalRawId, external.map((g) => g.externalId)),
      ) as never,
    );
  const titled = await db
    .select({ title: gamesCatalog.title })
    .from(gamesCatalog)
    .where(inArray(gamesCatalog.title, external.map((g) => g.title)) as never);
  const knownIds = new Set(known.map((r) => r.rawId));
  const knownTitles = new Set(titled.map((r) => r.title));

  const byRawId = new Map(external.map((g) => [g.externalId, g] as const));
  for (const row of known) {
    const ext = row.rawId ? byRawId.get(row.rawId) : undefined;
    if (!ext) continue;
    const genres = [...new Set([...row.genres, ...ext.genres])];
    const tags = [...new Set([...row.tags, ...ext.tags])];
    if (genres.length === row.genres.length && tags.length === row.tags.length) continue;
    await db.update(gamesCatalog).set({ genres, tags }).where(eq(gamesCatalog.id, row.id));
  }

  const fresh: ExternalGame[] = [];
  for (const g of external) {
    if (knownIds.has(g.externalId) || knownTitles.has(g.title)) continue;
    knownIds.add(g.externalId);
    knownTitles.add(g.title);
    fresh.push(g);
  }
  if (fresh.length === 0) return;

  await db.insert(gamesCatalog).values(
    fresh.map((g) => ({
      title: g.title,
      genres: g.genres,
      tags: g.tags,
      platform: g.platforms[0] ?? null,
      coverUrl: g.coverUrl,
      metacritic: g.metacritic,
      rating: g.rating != null ? String(g.rating) : null,
      releasedAt: g.releasedAt ? new Date(g.releasedAt) : null,
      esrb: g.esrb,
      externalSource: provider,
      externalRawId: g.externalId,
      externalIds: { provider, raw: g.externalId },
      description: g.description ?? null,
      playtimeHours: g.playtimeHours ?? null,
      stores: g.stores ?? [],
      website: g.website ?? null,
    })) as never,
  );
}

/**
 * Picks a random game for a roll: excludes blacklisted games and games
 * already rolled for this player in the current season.
 * Respects SeasonConfig.gamePool filters and optionally fetches from external provider.
 * When board.perCellGenre is enabled, overrides genres filter with the current cell's genres.
 *
 * Per source:
 *   - catalog — the local catalog only;
 *   - api     — only games its provider has supplied, and never anything else:
 *               a provider that fails or comes up empty is reported, not
 *               papered over with a local game;
 *   - hybrid  — the local catalog, topped up from the provider.
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
  const { filters, cellLocked } = await resolveEffectiveFilters(seasonPlayerId, config);
  // Under a primary tag, only it is required; the season's other genres and
  // tags rank instead of filtering (see lib/engine/pool/primary.ts).
  const split = splitPoolFilters(filters, { cellLocked });
  const textArray = (values: readonly string[]) =>
    sql`ARRAY[${sql.join(
      values.map((v) => sql`${v}`),
      sql`, `,
    )}]::text[]`;
  // As a genre or as a tag: providers disagree on which is which.
  const primaryCond =
    split.primary.length > 0
      ? sql`(${gamesCatalog.genres} && ${textArray(split.primary)} OR ${gamesCatalog.tags} && ${textArray(split.primary)})`
      : null;

  const conditions: unknown[] = [];
  conditions.push(eq(gamesCatalog.isBlacklisted, false) as never);
  if (playedIds.length > 0) {
    conditions.push(notInArray(gamesCatalog.id, playedIds) as never);
  }

  const extraSql: unknown[] = [];
  if (primaryCond) extraSql.push(primaryCond as never);
  if (split.hardGenres.length) {
    extraSql.push(sql`${gamesCatalog.genres} && ${textArray(split.hardGenres)}` as never);
  }
  if (split.hardTags.length) {
    extraSql.push(sql`${gamesCatalog.tags} && ${textArray(split.hardTags)}` as never);
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

  let baseOrder = sql`random()`;
  if (filters.ordering === "-metacritic") baseOrder = sql`${gamesCatalog.metacritic} DESC NULLS LAST, random()`;
  else if (filters.ordering === "metacritic") baseOrder = sql`${gamesCatalog.metacritic} ASC NULLS LAST, random()`;
  else if (filters.ordering === "-rating") baseOrder = sql`${gamesCatalog.rating}::numeric DESC NULLS LAST, random()`;
  else if (filters.ordering === "-released") baseOrder = sql`${gamesCatalog.releasedAt} DESC NULLS LAST, random()`;
  else if (filters.ordering === "name") baseOrder = sql`lower(${gamesCatalog.title}) ASC`;
  else if (filters.ordering === "-name") baseOrder = sql`lower(${gamesCatalog.title}) DESC`;
  // The preferences come first: how many of the season's other genres and tags
  // a game carries (`secondaryScore` in the engine says the same in TS). The
  // draw picks among the first `maxCandidates`, so a horror game that is also
  // survival and action comes up more often than a horror game that is neither
  // — but every game drawn is a horror game.
  const orderExpr: unknown =
    split.soft.length > 0
      ? sql`cardinality(ARRAY(SELECT unnest(${gamesCatalog.genres} || ${gamesCatalog.tags}) INTERSECT SELECT unnest(${textArray(split.soft)}))) DESC, ${baseOrder}`
      : baseOrder;

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

  // ---- api + hybrid: ask the provider ----
  if ((pool.source === "api" || pool.source === "hybrid") && pool.provider !== "internal") {
    let providerFailed = false;
    try {
      const { getProvider } = await import("@/lib/modules/catalog/providers");
      const external = await getProvider(pool.provider).search({ filters, pageSize: pool.maxCandidates, cacheTtlHours: pool.cacheTtlHours });
      await importExternalGames(external, pool.provider);
    } catch (e) {
      providerFailed = true;
      console.warn("[pickGameForRoll] provider fetch failed", e);
    }

    // An API season draws only from what its provider supplied. The draw used
    // to run over the whole shared catalog with the season's ordering, and
    // FreeToGame has no Metacritic score — so under the default "-metacritic"
    // ordering, NULLS LAST put every locally rated game ahead of the provider's
    // and an "API" season handed out the demo catalog. Rows imported by earlier
    // rolls still count: they came from this provider, which is what keeps a
    // season playable through a brief provider outage. A hybrid season mixes
    // both by definition, so its draw stays unscoped.
    const drawScope =
      pool.source === "api"
        ? and(whereClause as never, eq(gamesCatalog.externalSource, pool.provider) as never)
        : whereClause;
    const drawn = await db
      .select()
      .from(gamesCatalog)
      .where(drawScope as never)
      .orderBy(orderExpr as never)
      .limit(pool.maxCandidates);
    if (drawn.length > 0) {
      return { game: drawn[Math.floor(Math.random() * drawn.length)]!, reason: null };
    }
    if (pool.source === "api") {
      return { game: null, reason: providerFailed ? "provider_unavailable" : await explainEmptyPool(playedIds, pool) };
    }
  }

  // An API season stops here, always. It used to fall back to a random game
  // from the local catalog whenever its provider failed or came up empty
  // (the `fallbackToCatalog` setting, on by default) — so a dead key or a bad filter
  // looked like a working season that happened to hand out the wrong games.
  // Reaching this line with source "api" means no provider was chosen at all.
  if (pool.source === "api") {
    return { game: null, reason: await explainEmptyPool(playedIds, pool) };
  }

  // ---- catalog + hybrid only from here on ----
  if (candidates.length > 0) {
    return { game: candidates[Math.floor(Math.random() * candidates.length)]!, reason: null };
  }

  // Last resort: ignore the season's filters, but never the two rules that are
  // not filters — a blacklisted game and a game this participant has already
  // been given. There used to be one more step after this one, handing back any
  // non-blacklisted game at all, played or not. That is what made "already
  // played games never come up" untrue, and it was invisible: the player was
  // simply handed something familiar and nobody was told the pool had run dry.
  //
  // Nor the primary tag: it is not a filter either — it is what the season
  // is. A Horror season that has run out of horror games says so; it does not
  // start handing out whatever is left.
  const anyFallback = await db
    .select()
    .from(gamesCatalog)
    .where(
      and(
        eq(gamesCatalog.isBlacklisted, false) as never,
        ...(playedIds.length ? [notInArray(gamesCatalog.id, playedIds) as never] : []),
        ...(primaryCond ? [primaryCond as never] : []),
      ),
    )
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
