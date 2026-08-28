/**
 * Store-link helpers: merge provider-provided store URLs with sensible
 * search fallbacks per platform, so every game card can offer shopping links.
 * Pure TS — no next/react/drizzle imports.
 */

export interface StoreLink {
  store: string;
  url: string;
}

export interface StoreLinkSource {
  title: string;
  platform?: string | null;
  stores?: Array<{ store?: string | null; url?: string | null }> | null;
}

function enc(q: string): string {
  return encodeURIComponent(q.replace(/\s+/g, " ").trim());
}

interface Fallback {
  match: string[];
  label: string;
  build: (q: string) => string;
}

/** Search fallbacks per platform slug so the card is never empty. */
const FALLBACKS: Fallback[] = [
  {
    match: ["steam", "pc"],
    label: "Steam",
    build: (q) => `https://store.steampowered.com/search/?term=${enc(q)}`,
  },
  {
    match: ["pc"],
    label: "GOG",
    build: (q) => `https://www.gog.com/en/games?query=${enc(q)}`,
  },
  {
    match: ["pc"],
    label: "Epic",
    build: (q) => `https://store.epicgames.com/en-US/browse?q=${enc(q)}&sortBy=relevancy`,
  },
  {
    match: ["web", "browser"],
    label: "itch.io",
    build: (q) => `https://itch.io/search?q=${enc(q)}`,
  },
  {
    match: ["nintendo-switch", "nes", "snes", "gameboy", "gba", "gamecube"],
    label: "Nintendo eShop",
    build: (q) => `https://www.nintendo.com/us/search/#/${enc(q)}?_k=df07s`,
  },
  {
    match: ["playstation5", "playstation4"],
    label: "PlayStation Store",
    build: (q) => `https://store.playstation.com/en-us/search/${enc(q)}`,
  },
  {
    match: ["xbox-series-x", "xbox-one"],
    label: "Xbox",
    build: (q) => `https://www.xbox.com/en-US/search?q=${enc(q)}`,
  },
  {
    match: ["ios"],
    label: "App Store",
    build: (q) => `https://apps.apple.com/us/search?term=${enc(q)}`,
  },
  {
    match: ["android"],
    label: "Google Play",
    build: (q) => `https://play.google.com/store/search?q=${enc(q)}&c=apps`,
  },
];

function normalizeStores(raw: StoreLinkSource["stores"]): StoreLink[] {
  const out: StoreLink[] = [];
  for (const s of raw ?? []) {
    const store = s?.store?.trim();
    const url = s?.url?.trim();
    if (store && url && /^https?:\/\//i.test(url)) out.push({ store, url });
  }
  return out;
}

/**
 * Full list of store links for a game: provider stores first, then
 * platform-appropriate search fallbacks (Steam/GOG/Epic for PC, eShop/PSN/
 * Xbox for consoles, itch.io for web). Dedupes by URL.
 */
export function buildStoreLinks(game: StoreLinkSource): StoreLink[] {
  const links = normalizeStores(game.stores);
  const seen = new Set(links.map((l) => l.url));
  const platform = (game.platform ?? "").toLowerCase();

  for (const fb of FALLBACKS) {
    if (!fb.match.includes(platform) && platform !== "custom") continue;
    if (platform === "custom" && fb.match[0] !== "pc") continue;
    const url = fb.build(game.title);
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ store: fb.label, url });
  }
  // No platform set — still offer the generic PC stores.
  if (!platform && links.length === 0) {
    const q = enc(game.title);
    links.push(
      { store: "Steam", url: `https://store.steampowered.com/search/?term=${q}` },
      { store: "GOG", url: `https://www.gog.com/en/games?query=${q}` },
      { store: "Epic", url: `https://store.epicgames.com/en-US/browse?q=${q}&sortBy=relevancy` },
    );
  }
  return links;
}