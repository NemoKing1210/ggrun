/**
 * The scenario pool (docs/IEE_CONSTRUCTOR_SPEC.md §5.5, wave C): the games a
 * scenario's picks draw from, in their order — fixed, so a scenario that
 * names one reads the same everywhere. The titles are invented; the genres,
 * years and ratings spread across what the next game's rules name (§6.16).
 */
export const SCENARIO_GAME_KEYS = [
  "starfall",
  "old_keep",
  "quiet_house",
  "gear_run",
  "tiny_planet",
  "iron_tide",
  "night_shift",
  "sky_garden",
] as const;

export type ScenarioGame = (typeof SCENARIO_GAME_KEYS)[number];

export interface ScenarioGameRow {
  key: ScenarioGame;
  /** What the season's pool calls it — a game id, as a use's pick remembers it. */
  id: string;
  title: string;
  /** Lowercase, as the catalog names them. */
  genres: readonly string[];
  year: number;
  /** The catalog's rating, 0–5. */
  rating: number;
}

const ID = (n: number) => `5ce0a000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const SCENARIO_GAMES: readonly ScenarioGameRow[] = [
  { key: "starfall", id: ID(1), title: "Starfall", genres: ["action", "shooter"], year: 1993, rating: 3 },
  { key: "old_keep", id: ID(2), title: "Old Keep", genres: ["rpg"], year: 1997, rating: 4 },
  { key: "quiet_house", id: ID(3), title: "Quiet House", genres: ["horror", "adventure"], year: 2001, rating: 3.5 },
  { key: "gear_run", id: ID(4), title: "Gear Run", genres: ["racing"], year: 2005, rating: 2.5 },
  { key: "tiny_planet", id: ID(5), title: "Tiny Planet", genres: ["puzzle", "platformer"], year: 2009, rating: 4.5 },
  { key: "iron_tide", id: ID(6), title: "Iron Tide", genres: ["strategy"], year: 2012, rating: 3.8 },
  { key: "night_shift", id: ID(7), title: "Night Shift", genres: ["horror", "action"], year: 2016, rating: 4.2 },
  { key: "sky_garden", id: ID(8), title: "Sky Garden", genres: ["platformer", "adventure"], year: 2021, rating: 4.8 },
];

/** A game of the scenario pool by its key or its id. */
export function scenarioGame(ref: string): ScenarioGameRow | null {
  return SCENARIO_GAMES.find((g) => g.key === ref || g.id === ref) ?? null;
}
