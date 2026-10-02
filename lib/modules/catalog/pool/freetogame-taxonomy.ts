/**
 * FreeToGame speaks its own category vocabulary; the season's pool filters
 * speak ours (RAWG's slugs, `constants.ts`). This file is the translation, in
 * both directions, and nothing else — pure data and pure functions, so the
 * season editor can import it on the client to tell the host which of their
 * filters FreeToGame understands.
 *
 * Why it exists. A season restricted to "action / adventure + horror / survival"
 * rolled nothing at all: the provider sent FreeToGame one category (the first
 * genre it happened to recognise) and a `tag` parameter the `/games` endpoint
 * ignores, and stored each game under FreeToGame's own label ("shooter",
 * "mmorpg") — so the season's filter, applied to the stored rows in our
 * vocabulary, matched none of them.
 *
 * How FreeToGame filters, verified against the live API (2026-09-26):
 *   - `/games?category=x` — one category; an unknown one answers 404;
 *   - `/filter?tag=a.b.c` — every listed category must match (AND); an unknown
 *     one is silently ignored, which is why the maps below are pinned by a test
 *     against the known list rather than trusted;
 *   - "nothing found" is a 201 with an object instead of an array;
 *   - `platform` is `pc`, `browser` or `all` on both endpoints.
 *
 * The season's semantics are OR inside a group and AND across groups:
 * (any selected genre) AND (any selected tag). FreeToGame has no OR, so each
 * request is one (genre category, tag category) pair and the results are
 * unioned. A game returned for a pair is thereby *known* to carry the season
 * values that pair came from, and that is what gets stored — FreeToGame's list
 * response names only a game's main genre, never its tags.
 */
import type { GamePoolFilters } from "@/lib/engine/types";
import { sampleUniform } from "@/lib/engine/pool/sample";
import { primaryTagSlugs } from "@/lib/engine/pool/primary";

/** Every category FreeToGame accepted on 2026-09-26. A category outside this list is a typo. */
export const F2G_KNOWN_CATEGORIES = [
  "mmorpg", "shooter", "strategy", "moba", "racing", "sports", "social", "sandbox",
  "open-world", "survival", "pvp", "pve", "pixel", "voxel", "zombie", "turn-based",
  "first-person", "third-Person", "top-down", "tank", "space", "sailing", "side-scroller",
  "superhero", "permadeath", "card", "battle-royale", "mmo", "mmofps", "mmotps", "3d", "2d",
  "anime", "fantasy", "sci-fi", "fighting", "action-rpg", "action", "military",
  "martial-arts", "flight", "low-spec", "tower-defense", "horror", "mmorts",
] as const;

type F2gCategory = (typeof F2G_KNOWN_CATEGORIES)[number];

/**
 * Our genre → the FreeToGame categories that mean it. A genre that is absent
 * cannot be told apart by FreeToGame (adventure, puzzle, arcade, indie, family,
 * board games, educational): it has no such category and no game is labelled
 * with it.
 */
export const F2G_GENRE_CATEGORIES: Readonly<Record<string, readonly F2gCategory[]>> = {
  action: ["action"],
  rpg: ["mmorpg", "action-rpg"],
  strategy: ["strategy", "moba", "tower-defense", "mmorts"],
  shooter: ["shooter", "battle-royale"],
  racing: ["racing"],
  sports: ["sports"],
  fighting: ["fighting", "martial-arts"],
  card: ["card"],
  "massively-multiplayer": ["mmo"],
  simulation: ["flight", "sailing", "sandbox"],
  platformer: ["side-scroller"],
  casual: ["social"],
};

/** Our tag → the FreeToGame categories that mean it. Same rule for what is absent. */
export const F2G_TAG_CATEGORIES: Readonly<Record<string, readonly F2gCategory[]>> = {
  horror: ["horror"],
  survival: ["survival"],
  "open-world": ["open-world"],
  "sci-fi": ["sci-fi", "space"],
  fantasy: ["fantasy"],
  zombie: ["zombie"],
  "pixel-graphics": ["pixel"],
  roguelike: ["permadeath"],
  roguelite: ["permadeath"],
  multiplayer: ["pvp", "pve"],
  "co-op": ["pve"],
};

/**
 * FreeToGame's `genre` field (one per game, free text: "MMORPG", " MMORPG",
 * "Card Game", "Action RPG"…) in our vocabulary. Keys are lowercased and
 * trimmed. An unknown label is kept as its own slug rather than dropped.
 */
const F2G_MAIN_GENRE: Readonly<Record<string, { genres: readonly string[]; tags?: readonly string[] }>> = {
  mmorpg: { genres: ["massively-multiplayer", "rpg"] },
  mmo: { genres: ["massively-multiplayer"] },
  mmoarpg: { genres: ["massively-multiplayer", "action", "rpg"] },
  arpg: { genres: ["action", "rpg"] },
  "action rpg": { genres: ["action", "rpg"] },
  rpg: { genres: ["rpg"] },
  "dungeon crawler": { genres: ["rpg"] },
  action: { genres: ["action"] },
  "action game": { genres: ["action"] },
  shooter: { genres: ["shooter"] },
  "battle royale": { genres: ["shooter"] },
  "card game": { genres: ["card"] },
  card: { genres: ["card"] },
  fighting: { genres: ["fighting"] },
  racing: { genres: ["racing"] },
  sports: { genres: ["sports"] },
  strategy: { genres: ["strategy"] },
  moba: { genres: ["strategy"] },
  social: { genres: ["casual"] },
  fantasy: { genres: [], tags: ["fantasy"] },
};

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function f2gMainGenre(label: string | null | undefined): { genres: string[]; tags: string[] } {
  const key = (label ?? "").trim().toLowerCase();
  if (!key) return { genres: [], tags: [] };
  const hit = F2G_MAIN_GENRE[key];
  if (hit) return { genres: [...hit.genres], tags: [...(hit.tags ?? [])] };
  return { genres: [slug(key)], tags: [] };
}

/** One FreeToGame request, and what a game in its answer is thereby known to be. */
export interface F2gQuery {
  /** Categories ANDed in one `/filter` request; empty means the unfiltered `/games` list. */
  categories: string[];
  /** Season genres a game returned by this request carries. */
  genres: string[];
  /** Season tags a game returned by this request carries. */
  tags: string[];
}

export interface F2gPlan {
  queries: F2gQuery[];
  /** FreeToGame's `platform` parameter, when the season's platform filter narrows it. */
  platform: "pc" | "browser" | null;
}

/** Past this many requests per roll the pairs are sampled; the rest come up on later rolls. */
export const F2G_MAX_QUERIES = 6;

type Option = { category: string; ours: string[] };

function optionsFor(selected: readonly string[], map: Readonly<Record<string, readonly string[]>>): Option[] {
  const byCategory = new Map<string, string[]>();
  for (const value of selected) {
    for (const category of map[value] ?? []) {
      const ours = byCategory.get(category) ?? [];
      if (!ours.includes(value)) ours.push(value);
      byCategory.set(category, ours);
    }
  }
  return [...byCategory].map(([category, ours]) => ({ category, ours }));
}

function platformFor(platforms: readonly string[]): F2gPlan["platform"] | "none" {
  if (platforms.length === 0) return null;
  const pc = platforms.includes("pc");
  const web = platforms.includes("web");
  if (pc && !web) return "pc";
  if (web && !pc) return "browser";
  if (pc && web) return null;
  return "none";
}

/**
 * The requests that answer the season's filter, or `null` when FreeToGame
 * cannot answer it at all: a selected group none of whose values it knows
 * (an OR over nothing matches nothing), or a platform filter without PC and
 * browser. A group with *some* known values is answered for those; the rest
 * are reported by `f2gFilterSupport` so the host can see it.
 */
export function planF2gQueries(
  filters: Pick<GamePoolFilters, "genres" | "tags" | "platforms"> & { primaryTag?: string | null },
  rng: () => number,
  max: number = F2G_MAX_QUERIES,
): F2gPlan | null {
  const platform = platformFor(filters.platforms);
  if (platform === "none") return null;
  if (filters.primaryTag) return planWithPrimary({ ...filters, primaryTag: filters.primaryTag }, platform, rng, max);

  const genreOpts = optionsFor(filters.genres, F2G_GENRE_CATEGORIES);
  const tagOpts = optionsFor(filters.tags, F2G_TAG_CATEGORIES);
  if (filters.genres.length > 0 && genreOpts.length === 0) return null;
  if (filters.tags.length > 0 && tagOpts.length === 0) return null;

  let queries: F2gQuery[];
  if (genreOpts.length > 0 && tagOpts.length > 0) {
    queries = [];
    for (const g of genreOpts) {
      for (const t of tagOpts) {
        queries.push({
          categories: g.category === t.category ? [g.category] : [g.category, t.category],
          genres: g.ours,
          tags: t.ours,
        });
      }
    }
  } else if (genreOpts.length > 0) {
    queries = genreOpts.map((g) => ({ categories: [g.category], genres: g.ours, tags: [] }));
  } else if (tagOpts.length > 0) {
    queries = tagOpts.map((t) => ({ categories: [t.category], genres: [], tags: t.ours }));
  } else {
    queries = [{ categories: [], genres: [], tags: [] }];
  }

  if (queries.length > max) queries = sampleUniform(queries, max, rng);
  return { queries, platform };
}

/** Which of our two vocabularies a value belongs to, as far as FreeToGame is concerned. */
function creditFor(value: string): { genres: string[]; tags: string[] } {
  return F2G_GENRE_CATEGORIES[value] ? { genres: [value], tags: [] } : { genres: [], tags: [value] };
}

/**
 * Under a primary tag only that tag is required, so every request asks for
 * it: one request per FreeToGame category that means it, alone — that is the
 * pool. The season's other genres and tags only rank, and FreeToGame names no
 * game's tags in a list answer, so the remaining request budget asks for the
 * primary *together with* each of them: a game that comes back for "horror +
 * survival" is credited with survival and is drawn ahead of one that is only
 * horror. Those pair requests are sampled when they do not all fit.
 */
function planWithPrimary(
  filters: Pick<GamePoolFilters, "genres" | "tags"> & { primaryTag: string },
  platform: F2gPlan["platform"],
  rng: () => number,
  max: number,
): F2gPlan | null {
  const slugs = primaryTagSlugs(filters.primaryTag);
  const primaryCats = [...new Set(slugs.flatMap((v) => [...(F2G_GENRE_CATEGORIES[v] ?? []), ...(F2G_TAG_CATEGORIES[v] ?? [])]))];
  // FreeToGame cannot tell the primary tag apart: no game could be shown to have it.
  if (primaryCats.length === 0) return null;
  const credit = creditFor(filters.primaryTag);

  let base: F2gQuery[] = primaryCats.map((c) => ({ categories: [c], ...credit }));
  if (base.length > max) base = sampleUniform(base, max, rng);

  const softGenres = filters.genres.filter((g) => !slugs.includes(g));
  const softTags = filters.tags.filter((t) => !slugs.includes(t));
  const softOpts = [
    ...optionsFor(softGenres, F2G_GENRE_CATEGORIES).map((o) => ({ ...o, kind: "genres" as const })),
    ...optionsFor(softTags, F2G_TAG_CATEGORIES).map((o) => ({ ...o, kind: "tags" as const })),
  ];
  const pairs: F2gQuery[] = [];
  for (const p of primaryCats) {
    for (const o of softOpts) {
      if (o.category === p) continue;
      pairs.push({
        categories: [p, o.category],
        genres: [...credit.genres, ...(o.kind === "genres" ? o.ours : [])],
        tags: [...credit.tags, ...(o.kind === "tags" ? o.ours : [])],
      });
    }
  }
  const room = Math.max(0, max - base.length);
  return { queries: [...base, ...sampleUniform(pairs, room, rng)], platform };
}

/**
 * Unions the answers of several requests. A game that came back for more than
 * one request is known to carry every season value those requests stood for.
 */
export function mergeF2gResults<T extends { id: number }>(
  results: ReadonlyArray<{ query: F2gQuery; games: readonly T[] }>,
): Array<{ game: T; genres: string[]; tags: string[] }> {
  const byId = new Map<number, { game: T; genres: Set<string>; tags: Set<string> }>();
  for (const { query, games } of results) {
    for (const game of games) {
      const entry = byId.get(game.id) ?? { game, genres: new Set<string>(), tags: new Set<string>() };
      for (const g of query.genres) entry.genres.add(g);
      for (const t of query.tags) entry.tags.add(t);
      byId.set(game.id, entry);
    }
  }
  return [...byId.values()].map((e) => ({ game: e.game, genres: [...e.genres], tags: [...e.tags] }));
}

/** What the season editor tells the host about their filter under FreeToGame. */
export interface F2gFilterSupport {
  /** Selected genres FreeToGame cannot tell apart — ignored when choosing games. */
  ignoredGenres: string[];
  /** Selected tags FreeToGame cannot tell apart — ignored when choosing games. */
  ignoredTags: string[];
  /** Set when no game can match at all, and which part of the filter makes it so. */
  blocked: null | "primary" | "genres" | "tags" | "platforms";
}

export function f2gFilterSupport(
  filters: Pick<GamePoolFilters, "genres" | "tags" | "platforms"> & { primaryTag?: string | null },
): F2gFilterSupport {
  const primary = primaryTagSlugs(filters.primaryTag);
  const ignoredGenres = filters.genres.filter((g) => !F2G_GENRE_CATEGORIES[g] && !primary.includes(g));
  const ignoredTags = filters.tags.filter((t) => !F2G_TAG_CATEGORIES[t] && !primary.includes(t));
  let blocked: F2gFilterSupport["blocked"] = null;
  if (platformFor(filters.platforms) === "none") blocked = "platforms";
  else if (primary.length > 0) {
    // Under a primary tag the other genres and tags only rank, so they can
    // never block the pool; the primary tag itself can.
    const known = primary.some((v) => F2G_GENRE_CATEGORIES[v] || F2G_TAG_CATEGORIES[v]);
    if (!known) blocked = "primary";
  } else if (filters.genres.length > 0 && ignoredGenres.length === filters.genres.length) blocked = "genres";
  else if (filters.tags.length > 0 && ignoredTags.length === filters.tags.length) blocked = "tags";
  return { ignoredGenres, ignoredTags, blocked };
}
