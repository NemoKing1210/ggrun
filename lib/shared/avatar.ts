/**
 * Deterministic emoji avatar fallback.
 *
 * When a user has no uploaded picture we render a stable emoji picked from
 * the user id (or username when the id is not in scope). FNV-1a hashing keeps
 * it dependency-free and identical on server and client — no `Math.random`,
 * so SSR and hydration never disagree.
 */

/** Curated single-codepoint glyphs with a strong silhouette at 12–48 px. No skin tones, ZWJ sequences, or flags. */
export const AVATAR_EMOJI = [
  "👾",
  "🤖",
  "👻",
  "💀",
  "🤡",
  "👹",
  "👺",
  "🎃",
  "🐺",
  "🦊",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🦆",
  "🦉",
  "🦅",
  "🐗",
  "🐝",
  "🦋",
  "🐢",
  "🐙",
  "🦑",
  "🦀",
  "🐍",
  "🦂",
  "🐲",
  "🦄",
  "🐳",
  "🐬",
  "🦈",
  "🍄",
  "🌵",
  "🌊",
  "🔥",
  "⚡",
  "❄️",
  "🌪️",
  "☄️",
  "🌙",
  "⭐",
  "🌟",
  "💎",
  "🚀",
  "🛸",
  "🎲",
  "🎯",
  "🎮",
  "🕹️",
  "🏆",
  "🥷",
  "🧙",
  "🧛",
  "🧜",
  "🦸",
  "🧞",
  "👽",
  "🎭",
];

/**
 * Muted HUD-grade gradient tints behind the glyph. Full literal class names
 * so the Tailwind scanner picks them up — never interpolate color fragments.
 */
const AVATAR_TINTS = [
  "from-amber-500/25 to-amber-950/40",
  "from-orange-500/25 to-orange-950/40",
  "from-lime-500/20 to-lime-950/40",
  "from-cyan-500/25 to-cyan-950/40",
  "from-sky-500/25 to-sky-950/40",
  "from-violet-500/25 to-violet-950/40",
  "from-pink-500/25 to-pink-950/40",
  "from-emerald-500/20 to-emerald-950/40",
];

/** FNV-1a 32-bit over UTF-16 code units. */
export function hashAvatarSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable emoji for a seed (user id preferred, username otherwise). */
export function avatarEmojiFor(seed: string | null | undefined): string {
  const h = hashAvatarSeed(seed ?? "");
  return AVATAR_EMOJI[h % AVATAR_EMOJI.length] ?? "👾";
}

/** Stable gradient tint for a seed. Uses higher hash bits so tint varies independently of the glyph. */
export function avatarTintFor(seed: string | null | undefined): string {
  const h = hashAvatarSeed(seed ?? "");
  return AVATAR_TINTS[Math.floor(h / AVATAR_EMOJI.length) % AVATAR_TINTS.length] ?? AVATAR_TINTS[0]!;
}
