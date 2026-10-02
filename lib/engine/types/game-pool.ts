
/** Game pool source — where rolled games come from. */
export type GamePoolSource = "catalog" | "api" | "hybrid";

/** External API provider for hybrid/api modes. */
export type GameProviderId =
  | "internal"
  | "rawg"
  | "igdb"
  | "steam"
  | "freetogame"
  | "gamespot";

/** Filters applied when picking a game (catalog or API). */
export interface GamePoolFilters {
  genres: string[];
  platforms: string[];
  tags: string[];
  metacriticMin: number | null;
  metacriticMax: number | null;
  ratingMin: number | null;
  ratingMax: number | null;
  yearMin: number | null;
  yearMax: number | null;
  esrb: string[];
  players: "any" | "single" | "multi" | "coop";
  onlyWithCover: boolean;
  ordering: string;
  searchQuery: string | null;
  /**
   * The one genre or tag a game must carry to be drawn (see
   * `lib/engine/pool/primary.ts`). Set by a template from its name, editable on
   * its own. When set, `genres` and `tags` only rank; `null` keeps them as
   * requirements, as they always were.
   */
  primaryTag: string | null;
}

export interface GamePoolCatalogOptions {
  allowManualAdd: boolean;
}

export interface GamePoolConfig {
  source: GamePoolSource;
  provider: GameProviderId;
  templateId: string | null;
  filters: GamePoolFilters;
  catalog: GamePoolCatalogOptions;
  maxCandidates: number;
  cacheTtlHours: number;
  autoFetchOnRoll: boolean;
}
