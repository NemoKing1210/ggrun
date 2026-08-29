/**
 * Auto-title generator for seasons — pair of random tactical words.
 * Pure TS, safe on server and client, no next/react imports.
 */

const ADJECTIVES = [
  "Crimson",
  "Neon",
  "Phantom",
  "Iron",
  "Void",
  "Frost",
  "Ember",
  "Storm",
  "Obsidian",
  "Cobalt",
  "Solar",
  "Lunar",
  "Apex",
  "Nexus",
  "Vortex",
  "Echo",
  "Hollow",
  "Rogue",
  "Nova",
  "Delta",
  "Onyx",
  "Sable",
  "Azure",
  "Aurora",
  "Blitz",
  "Specter",
  "Vector",
  "Kinetic",
  "Prism",
  "Pulse",
] as const;

const NOUNS = [
  "Protocol",
  "Horizon",
  "Revenant",
  "Frontier",
  "Run",
  "Sector",
  "Matrix",
  "Signal",
  "Warden",
  "Nomad",
  "Specter",
  "Eclipse",
  "Drifter",
  "Beacon",
  "Archive",
  "Circuit",
  "Phantom",
  "Outbreak",
  "Harbinger",
  "Vanguard",
  "Reckoning",
  "Parallax",
  "Mirage",
  "Ashen",
  "Rift",
  "Helix",
  "Aegis",
  "Cinder",
  "Exodus",
  "Lumen",
] as const;

function pick<T>(arr: readonly T[], rng = Math.random): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/**
 * Generates a Title-Cased two-word season name, e.g. "Neon Revenant".
 * When `rng` is injected tests get deterministic output.
 */
export function generateSeasonTitle(rng: () => number = Math.random): string {
  // avoid duplicate word like "Phantom Phantom" (exists in both lists)
  const adj = pick(ADJECTIVES, rng);
  let noun = pick(NOUNS, rng);
  let guard = 0;
  while (noun.toLowerCase() === adj.toLowerCase() && guard < 5) {
    noun = pick(NOUNS, rng);
    guard++;
  }
  return `${adj} ${noun}`;
}

/** Generates a slug-friendly variant: "neon-revenant". Useful for previews. */
export function generateSeasonSlug(rng: () => number = Math.random): string {
  return generateSeasonTitle(rng).toLowerCase().replace(/\s+/g, "-");
}

/** Exposed for admin board matrix previews and tests. */
export const SEASON_TITLE_WORDS = { adjectives: ADJECTIVES, nouns: NOUNS } as const;
