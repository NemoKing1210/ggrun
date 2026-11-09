import { and, desc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { boardCells, boards, gameRolls, gamesCatalog, seasonPlayers, seasons, type CatalogGame } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, POOL_EMPTY_ERROR, SeasonConfigSchema, splitPoolFilters, type PoolEmptyReason } from "@/lib/engine";
import type { GameMatch, PickRequest, SeasonConfig, UsePick } from "@/lib/engine/types";
import type { GamesView } from "@/lib/engine/iee/dsl";
import { NO_POOL_SHAPE, drawDistinct, drawWeighted, offersChoice, type PoolShape } from "@/lib/engine/iee/resolve/pool";
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

/**
 * A game for a roll, or why there is none. `relaxed`: the holder's rules
 * narrowed the pool to nothing and were set aside (spec §6.16); `favoured`:
 * the game is one a rule of theirs favoured. `offered`: the games a choice
 * offers (`chooseOfN`, §7.12) — two or more, `game` the first of them — and
 * none when there is no choice.
 */
export type PoolPick =
  | { game: CatalogGame; reason: null; relaxed: boolean; favoured: boolean; offered: CatalogGame[] }
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

const textArray = (values: readonly string[]) =>
  sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

/**
 * The games a rule of the holder names (spec §6.16), as SQL — what
 * `gameMatches` in the engine says in TypeScript: a genre in the set in any
 * case, a release year and a rating within their bounds. A game without a
 * release date or a rating matches no bound on it.
 */
function matchSql(match: GameMatch): SQL {
  const parts: SQL[] = [];
  if (match.genres) {
    parts.push(sql`EXISTS (SELECT 1 FROM unnest(${gamesCatalog.genres}) AS g WHERE lower(g) = ANY(${textArray(match.genres.map((x) => x.toLowerCase()))}))`);
  }
  if (match.years) {
    parts.push(sql`${gamesCatalog.releasedAt} IS NOT NULL`);
    if (match.years.min !== null) parts.push(sql`EXTRACT(YEAR FROM ${gamesCatalog.releasedAt}) >= ${match.years.min}`);
    if (match.years.max !== null) parts.push(sql`EXTRACT(YEAR FROM ${gamesCatalog.releasedAt}) <= ${match.years.max}`);
  }
  if (match.rating) {
    parts.push(sql`${gamesCatalog.rating} IS NOT NULL`);
    if (match.rating.min !== null) parts.push(sql`${gamesCatalog.rating}::numeric >= ${match.rating.min}`);
    if (match.rating.max !== null) parts.push(sql`${gamesCatalog.rating}::numeric <= ${match.rating.max}`);
  }
  return parts.length > 0 ? sql`(${sql.join(parts, sql` AND `)})` : sql`TRUE`;
}

/** What the holder's exclusions and requirements narrow the pool to, as SQL conditions. */
function shapeSql(shape: Pick<PoolShape, "exclude" | "require">): SQL[] {
  return [...shape.exclude.map((m) => sql`NOT ${matchSql(m)}`), ...shape.require.map((m) => matchSql(m))];
}

/** The season's pool for a participant: what it may draw from and in which order. */
interface PoolScope {
  pool: SeasonConfig["gamePool"];
  filters: SeasonConfig["gamePool"]["filters"];
  playedIds: string[];
  /** The season's filters and the games the participant has had. */
  whereClause: SQL;
  orderExpr: SQL;
  /** The season's primary tag, which even the last resort keeps. */
  primaryCond: SQL | null;
  /** What an API season draws from: only what its provider supplied. */
  drawScope: SQL;
}

async function poolScope(seasonPlayerId: string): Promise<PoolScope> {
  const played = await db.select({ gameId: gameRolls.gameId }).from(gameRolls).where(eq(gameRolls.seasonPlayerId, seasonPlayerId));
  const playedIds = played.map((r) => r.gameId).filter((id): id is string => id !== null);

  const config = (await fetchSeasonConfig(seasonPlayerId)) ?? DEFAULT_SEASON_CONFIG;
  const pool = config.gamePool;
  const { filters, cellLocked } = await resolveEffectiveFilters(seasonPlayerId, config);
  // Under a primary tag, only it is required; the season's other genres and
  // tags rank instead of filtering (see lib/engine/pool/primary.ts).
  const split = splitPoolFilters(filters, { cellLocked });
  // As a genre or as a tag: providers disagree on which is which.
  const primaryCond =
    split.primary.length > 0
      ? sql`(${gamesCatalog.genres} && ${textArray(split.primary)} OR ${gamesCatalog.tags} && ${textArray(split.primary)})`
      : null;

  const conditions: SQL[] = [];
  conditions.push(eq(gamesCatalog.isBlacklisted, false));
  if (playedIds.length > 0) conditions.push(notInArray(gamesCatalog.id, playedIds));
  if (primaryCond) conditions.push(primaryCond);
  if (split.hardGenres.length) conditions.push(sql`${gamesCatalog.genres} && ${textArray(split.hardGenres)}`);
  if (split.hardTags.length) conditions.push(sql`${gamesCatalog.tags} && ${textArray(split.hardTags)}`);
  if (filters.platforms.length) conditions.push(sql`${gamesCatalog.platform} = ANY(${textArray(filters.platforms)})`);
  if (filters.esrb.length) conditions.push(sql`${gamesCatalog.esrb} = ANY(${textArray(filters.esrb)})`);
  if (filters.searchQuery && filters.searchQuery.trim().length) {
    const q = `%${filters.searchQuery.trim().toLowerCase()}%`;
    conditions.push(sql`lower(${gamesCatalog.title}) LIKE ${q}`);
  }
  if (filters.onlyWithCover) conditions.push(sql`${gamesCatalog.coverUrl} IS NOT NULL AND ${gamesCatalog.coverUrl} <> ''`);
  if (filters.metacriticMin !== null) conditions.push(sql`${gamesCatalog.metacritic} >= ${filters.metacriticMin}`);
  if (filters.metacriticMax !== null) conditions.push(sql`${gamesCatalog.metacritic} <= ${filters.metacriticMax}`);
  if (filters.ratingMin !== null) conditions.push(sql`${gamesCatalog.rating}::numeric >= ${filters.ratingMin}`);
  if (filters.ratingMax !== null) conditions.push(sql`${gamesCatalog.rating}::numeric <= ${filters.ratingMax}`);
  if (filters.yearMin !== null) conditions.push(sql`EXTRACT(YEAR FROM ${gamesCatalog.releasedAt}) >= ${filters.yearMin}`);
  if (filters.yearMax !== null) conditions.push(sql`EXTRACT(YEAR FROM ${gamesCatalog.releasedAt}) <= ${filters.yearMax}`);
  const whereClause = and(...conditions)!;

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
  const orderExpr =
    split.soft.length > 0
      ? sql`cardinality(ARRAY(SELECT unnest(${gamesCatalog.genres} || ${gamesCatalog.tags}) INTERSECT SELECT unnest(${textArray(split.soft)}))) DESC, ${baseOrder}`
      : baseOrder;

  // An API season draws only from what its provider supplied. The draw used
  // to run over the whole shared catalog with the season's ordering, and
  // FreeToGame has no Metacritic score — so under the default "-metacritic"
  // ordering, NULLS LAST put every locally rated game ahead of the provider's
  // and an "API" season handed out the demo catalog. Rows imported by earlier
  // rolls still count: they came from this provider, which is what keeps a
  // season playable through a brief provider outage. A hybrid season mixes
  // both by definition, so its draw stays unscoped.
  const drawScope = pool.source === "api" ? and(whereClause, eq(gamesCatalog.externalSource, pool.provider))! : whereClause;
  return { pool, filters, playedIds, whereClause, orderExpr, primaryCond, drawScope };
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
 * The holder's rules (`shape`, spec §6.16, §7.12) narrow what the season
 * allows and favour games in it. When nothing is left with them, the
 * exclusions and requirements are set aside and the draw goes on without them
 * (`relaxed`): a rule never keeps a player from playing. A favoured game the
 * first candidates do not reach joins them when the pool holds it. A choice
 * (`shape.choice`) draws that many different games among them, at least that
 * many candidates deep — `offered`; with fewer than two there is no choice.
 *
 * Returns *why* it found nothing rather than a bare null. It also no longer
 * quietly hands back a game the participant has already played: the catalog
 * path used to fall through to "any non-blacklisted game at all" once the
 * unplayed ones ran out, so depending on a setting nobody can see, exhausting
 * the pool either repeated a game in silence or failed with a message naming
 * the wrong cause. The README promises that already-played games never come up;
 * that promise is now kept, and running out is reported instead.
 */
export async function pickGameForRoll(
  seasonPlayerId: string,
  shape: Pick<PoolShape, "exclude" | "require" | "favor" | "choice"> = NO_POOL_SHAPE,
  rng: () => number = Math.random,
): Promise<PoolPick> {
  const { pool, filters, playedIds, whereClause, orderExpr, primaryCond, drawScope } = await poolScope(seasonPlayerId);
  const rules = shapeSql(shape);
  const favouredIds = shape.favor.map((f) => f.gameId);
  // A choice of n draws among at least n candidates (§7.12).
  const reach = Math.max(pool.maxCandidates, shape.choice);

  /** The first candidates of a scope, and the favoured games it holds that they do not reach. */
  const draw = async (scope: SQL): Promise<CatalogGame[]> => {
    const rows = await db.select().from(gamesCatalog).where(scope).orderBy(orderExpr).limit(reach);
    const missing = favouredIds.filter((id) => !rows.some((row) => row.id === id));
    if (missing.length > 0) rows.push(...(await db.select().from(gamesCatalog).where(and(scope, inArray(gamesCatalog.id, missing)))));
    return rows;
  };
  /** The holder's rules first; with nothing left they are set aside. */
  const drawShaped = async (scope: SQL): Promise<{ rows: CatalogGame[]; relaxed: boolean }> => {
    if (rules.length > 0) {
      const rows = await draw(and(scope, ...rules)!);
      if (rows.length > 0) return { rows, relaxed: false };
    }
    return { rows: await draw(scope), relaxed: rules.length > 0 };
  };
  const picked = (rows: readonly CatalogGame[], relaxed: boolean): PoolPick => {
    // A choice offers n different games, each weighing its favour; with fewer than two there is none.
    if (offersChoice(shape, rows.length)) {
      const offered = drawDistinct(rows, shape, shape.choice, rng);
      return { game: offered[0]!, reason: null, relaxed, favoured: offered.some((g) => favouredIds.includes(g.id)), offered };
    }
    const game = drawWeighted(rows, shape, rng)!;
    return { game, reason: null, relaxed, favoured: favouredIds.includes(game.id), offered: [] };
  };

  // ---- catalog + hybrid: local filtered pool first ----
  let candidates: { rows: CatalogGame[]; relaxed: boolean } = { rows: [], relaxed: false };
  if (pool.source === "catalog" || pool.source === "hybrid") {
    candidates = await drawShaped(whereClause);
    if (candidates.rows.length > 0) {
      if (pool.source === "hybrid" && pool.autoFetchOnRoll && pool.provider !== "internal" && Math.random() < 0.5) {
        // fall through to API fetch attempt
      } else {
        return picked(candidates.rows, candidates.relaxed);
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

    const drawn = await drawShaped(drawScope);
    if (drawn.rows.length > 0) return picked(drawn.rows, drawn.relaxed);
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
  if (candidates.rows.length > 0) return picked(candidates.rows, candidates.relaxed);

  // Last resort: ignore the season's filters, but never the two rules that are
  // not filters — a blacklisted game and a game this participant has already
  // been given. There used to be one more step after this one, handing back any
  // non-blacklisted game at all, played or not. That is what made "already
  // played games never come up" untrue, and it was invisible: the player was
  // simply handed something familiar and nobody was told the pool had run dry.
  //
  // Nor the primary tag: it is not a filter either — it is what the season
  // is. A Horror season that has run out of horror games says so; it does not
  // start handing out whatever is left. The holder's rules are set aside by
  // now: the season's own filters narrowed the pool to nothing before them.
  const anyFallback = await db
    .select()
    .from(gamesCatalog)
    .where(
      and(
        eq(gamesCatalog.isBlacklisted, false),
        ...(playedIds.length ? [notInArray(gamesCatalog.id, playedIds)] : []),
        ...(primaryCond ? [primaryCond] : []),
      ),
    )
    .orderBy(sql`random()`)
    .limit(Math.max(1, shape.choice));
  if (anyFallback[0]) return picked(anyFallback, rules.length > 0);

  return { game: null, reason: await explainEmptyPool(playedIds, pool) };
}

/**
 * The holder's games, as their rules at `beforeGameRoll` read them (wave C,
 * spec §6.16): the genres of the last game they passed and of every game they
 * passed this season, lowercase.
 */
export async function gamesViewOf(seasonPlayerId: string): Promise<GamesView> {
  const rows = await db
    .select({ genres: gamesCatalog.genres })
    .from(gameRolls)
    .innerJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(and(eq(gameRolls.seasonPlayerId, seasonPlayerId), eq(gameRolls.status, "passed")))
    .orderBy(desc(gameRolls.resolvedAt), desc(gameRolls.rolledAt));
  const lower = (genres: readonly string[]) => [...new Set(genres.map((g) => g.toLowerCase()))];
  return { lastPassed: rows[0] ? lower(rows[0].genres) : null, passed: lower(rows.flatMap((r) => r.genres)) };
}

/**
 * What a use may pick for the next game (wave C, `usage.pick`, spec §6.16),
 * from what the season's pool offers the participant: the genres of its games,
 * the decades they were released in. Games are searched for by title.
 */
export async function pickOffers(seasonPlayerId: string): Promise<{ genres: string[]; decades: number[] }> {
  const { drawScope } = await poolScope(seasonPlayerId);
  const genres = await db.execute<{ genre: string }>(
    sql`SELECT DISTINCT lower(g) AS genre FROM ${gamesCatalog}, unnest(${gamesCatalog.genres}) AS g WHERE ${drawScope} ORDER BY 1 LIMIT 200`,
  );
  const decades = await db.execute<{ decade: number }>(
    sql`SELECT DISTINCT (floor(EXTRACT(YEAR FROM ${gamesCatalog.releasedAt}) / 10) * 10)::int AS decade FROM ${gamesCatalog} WHERE ${drawScope} AND ${gamesCatalog.releasedAt} IS NOT NULL ORDER BY 1`,
  );
  return {
    genres: genres.rows.map((r) => r.genre).filter((g) => g.length > 0),
    decades: decades.rows.map((r) => Number(r.decade)).filter((d) => Number.isFinite(d)),
  };
}

/** The games catalog's genres, lowercase and sorted — what a rule of the next game may name (wave C, spec §6.16). */
export async function catalogGenres(): Promise<string[]> {
  const rows = await db.execute<{ genre: string }>(
    sql`SELECT DISTINCT lower(g) AS genre FROM ${gamesCatalog}, unnest(${gamesCatalog.genres}) AS g WHERE ${gamesCatalog.isBlacklisted} = false ORDER BY 1 LIMIT 500`,
  );
  return rows.rows.map((r) => r.genre).filter((g) => g.length > 0);
}

/** Games of the pool a participant could be handed, by title — what a pick of a game offers (spec §6.16). */
export async function pickGames(seasonPlayerId: string, query: string, limit = 30): Promise<{ id: string; title: string }[]> {
  const { drawScope } = await poolScope(seasonPlayerId);
  const q = query.trim().toLowerCase();
  return db
    .select({ id: gamesCatalog.id, title: gamesCatalog.title })
    .from(gamesCatalog)
    .where(q ? and(drawScope, sql`lower(${gamesCatalog.title}) LIKE ${`%${q}%`}`) : drawScope)
    .orderBy(sql`lower(${gamesCatalog.title})`)
    .limit(limit);
}

/**
 * The pick as it stands when the season's pool offers it to the participant
 * (spec §6.16): a genre of its games, a decade it has games from, a game it
 * could hand them — with the game's title; null when it offers no such thing.
 */
export async function offeredPick(seasonPlayerId: string, pick: PickRequest): Promise<UsePick | null> {
  // A cell is the board's to offer, not the pool's (wave D, spec §6.18).
  if ("cell" in pick) return null;
  const { drawScope } = await poolScope(seasonPlayerId);
  if ("genre" in pick) {
    const genre = pick.genre.trim().toLowerCase();
    const rows = await db.select({ id: gamesCatalog.id }).from(gamesCatalog).where(and(drawScope, matchSql({ genres: [genre] }))).limit(1);
    return rows.length > 0 ? { genre } : null;
  }
  if ("years" in pick) {
    const [from, to] = pick.years;
    // A decade: 1990–1999.
    if (from % 10 !== 0 || to !== from + 9) return null;
    const rows = await db.select({ id: gamesCatalog.id }).from(gamesCatalog).where(and(drawScope, matchSql({ years: { min: from, max: to } }))).limit(1);
    return rows.length > 0 ? { years: [from, to] } : null;
  }
  const rows = await db.select({ id: gamesCatalog.id, title: gamesCatalog.title }).from(gamesCatalog).where(and(drawScope, eq(gamesCatalog.id, pick.gameId))).limit(1);
  return rows[0] ? { gameId: rows[0].id, title: rows[0].title } : null;
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
