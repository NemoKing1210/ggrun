/**
 * The primary tag: the one thing a game must be to belong to a season's pool.
 *
 * A template used to become a broad filter — the Horror template turned into
 * "(action or adventure) and (horror or survival or atmospheric or zombie)" —
 * and every survival shooter passed it, so a season called Horror handed out
 * battle royales. The host's expectation was simpler: pick Horror, get horror
 * games. So each template names one value, taken from its own name, and a game
 * without it never comes up. The season's other genres and tags stop being
 * requirements; a game that carries more of them is drawn first (see
 * `secondaryScore`), which keeps the templates' flavour without letting it
 * dilute the category.
 *
 * The value may be a genre or a tag and is matched against both: providers do
 * not agree on which is which (RAWG files "indie" as a genre and "horror" as a
 * tag; FreeToGame has no such split at all).
 *
 * Pure: the template map lives here rather than beside the templates because
 * the config schema needs it to upgrade seasons saved before primary tags
 * existed, and the engine imports nothing from above it.
 */

/** Template id → its primary tag. Every template must have one (tested). */
export const TEMPLATE_PRIMARY_TAG: Readonly<Record<string, string>> = {
  horror: "horror",
  strategy: "strategy",
  rpg: "rpg",
  action: "action",
  indie: "indie",
  retro: "retro",
  survival: "survival",
  "sci-fi": "sci-fi",
  fantasy: "fantasy",
  roguelike: "roguelike",
  // "Cozy & Family": casual rather than family — closer to "cozy", and a far
  // larger category in every provider (the host's call).
  cozy: "casual",
  esports: "multiplayer",
};

/** Values that count as the same primary tag. Kept deliberately short. */
const EQUIVALENT: Readonly<Record<string, readonly string[]>> = {
  roguelike: ["roguelike", "roguelite"],
  roguelite: ["roguelite", "roguelike"],
};

/** Every value that satisfies `primary`; empty when there is none. */
export function primaryTagSlugs(primary: string | null | undefined): string[] {
  if (!primary) return [];
  return [...(EQUIVALENT[primary] ?? [primary])];
}

type Categorised = { genres: readonly string[]; tags: readonly string[] };

/** Whether a game carries the primary tag, as a genre or as a tag. No primary → anything matches. */
export function matchesPrimaryTag(game: Categorised, primary: string | null | undefined): boolean {
  const slugs = primaryTagSlugs(primary);
  if (slugs.length === 0) return true;
  return slugs.some((s) => game.genres.includes(s) || game.tags.includes(s));
}

/**
 * How many of the season's other genres and tags a game carries. Under a
 * primary tag these are preferences, not requirements: the draw orders by this
 * score before anything else. Mirrors the SQL in the pool repository.
 */
export function secondaryScore(game: Categorised, soft: readonly string[]): number {
  const own = new Set([...game.genres, ...game.tags]);
  return new Set(soft.filter((v) => own.has(v))).size;
}

/**
 * Splits the season's genre and tag lists into what must match and what only
 * ranks. Without a primary tag nothing changes: both lists are requirements,
 * as they always were. With one, they become preferences — except genres a
 * board cell locks the player into, which stay hard (`cellLocked`).
 */
export function splitPoolFilters(
  filters: { genres: readonly string[]; tags: readonly string[]; primaryTag?: string | null },
  opts: { cellLocked?: boolean } = {},
): { primary: string[]; hardGenres: string[]; hardTags: string[]; soft: string[] } {
  const primary = primaryTagSlugs(filters.primaryTag);
  if (primary.length === 0) {
    return { primary, hardGenres: [...filters.genres], hardTags: [...filters.tags], soft: [] };
  }
  const hardGenres = opts.cellLocked ? [...filters.genres] : [];
  const soft = [...new Set([...(opts.cellLocked ? [] : filters.genres), ...filters.tags])].filter(
    (v) => !primary.includes(v),
  );
  return { primary, hardGenres, hardTags: [], soft };
}
