import type { GamePoolFilters } from "@/game-engine/types";

export interface GamePoolTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  heroIcon: string;
  filters: Partial<GamePoolFilters>;
  boardHint?: { bonusCount: number; penaltyCount: number; eventCount: number };
}

export const GAME_POOL_TEMPLATES: GamePoolTemplate[] = [
  {
    id: "horror",
    label: "Horror",
    description: "Survival horror, atmospheric dread, monsters and isolation.",
    icon: "👻",
    heroIcon: "EyeIcon",
    filters: {
      genres: ["action", "adventure"],
      tags: ["horror", "survival", "atmospheric", "zombie"],
      ordering: "-rating",
    },
    boardHint: { bonusCount: 2, penaltyCount: 6, eventCount: 4 },
  },
  {
    id: "strategy",
    label: "Strategy",
    description: "Think, plan, conquer — RTS, TBS and grand strategy.",
    icon: "♟️",
    heroIcon: "PuzzlePieceIcon",
    filters: {
      genres: ["strategy", "simulation"],
      tags: ["difficult", "crafting"],
      ordering: "-metacritic",
    },
    boardHint: { bonusCount: 3, penaltyCount: 3, eventCount: 5 },
  },
  {
    id: "rpg",
    label: "RPG Adventure",
    description: "Story-rich role-playing, loot and progression.",
    icon: "⚔️",
    heroIcon: "ShieldCheckIcon",
    filters: {
      genres: ["rpg", "adventure"],
      tags: ["story-rich", "fantasy", "open-world"],
      ordering: "-metacritic",
    },
    boardHint: { bonusCount: 5, penaltyCount: 2, eventCount: 4 },
  },
  {
    id: "action",
    label: "High-Octane Action",
    description: "Shooters, platformers and arcade adrenaline.",
    icon: "💥",
    heroIcon: "BoltIcon",
    filters: {
      genres: ["action", "shooter", "arcade"],
      tags: ["difficult", "co-op"],
      ordering: "-added",
    },
    boardHint: { bonusCount: 4, penaltyCount: 4, eventCount: 2 },
  },
  {
    id: "indie",
    label: "Indie Gems",
    description: "Inventive indies, pixel art and roguelikes.",
    icon: "✨",
    heroIcon: "SparklesIcon",
    filters: {
      genres: ["indie", "casual", "arcade"],
      tags: ["pixel-graphics", "roguelike", "roguelite"],
      ordering: "-rating",
    },
    boardHint: { bonusCount: 6, penaltyCount: 2, eventCount: 3 },
  },
  {
    id: "retro",
    label: "Retro",
    description: "Old-school classics, 80s–90s nostalgia up to 2005.",
    icon: "📼",
    heroIcon: "TvIcon",
    filters: {
      genres: ["arcade", "platformer"],
      tags: ["retro", "pixel-graphics"],
      yearMin: 1980,
      yearMax: 2005,
      ordering: "-metacritic",
    },
    boardHint: { bonusCount: 3, penaltyCount: 3, eventCount: 2 },
  },
  {
    id: "survival",
    label: "Survival & Crafting",
    description: "Gather, build, endure — the wild and wasteland.",
    icon: "🌲",
    heroIcon: "MapIcon",
    filters: {
      genres: ["simulation", "adventure"],
      tags: ["survival", "crafting", "open-world"],
      ordering: "-rating",
    },
    boardHint: { bonusCount: 3, penaltyCount: 5, eventCount: 3 },
  },
  {
    id: "sci-fi",
    label: "Sci-Fi",
    description: "Space, cyberpunk, futures not yet written.",
    icon: "🚀",
    heroIcon: "RocketLaunchIcon",
    filters: {
      genres: ["action", "adventure", "strategy"],
      tags: ["sci-fi", "cyberpunk", "open-world"],
      ordering: "-metacritic",
    },
    boardHint: { bonusCount: 4, penaltyCount: 3, eventCount: 4 },
  },
  {
    id: "fantasy",
    label: "Fantasy",
    description: "Swords, sorcery and sprawling realms.",
    icon: "🧚",
    heroIcon: "StarIcon",
    filters: {
      genres: ["rpg", "adventure"],
      tags: ["fantasy", "story-rich", "open-world"],
      ordering: "-metacritic",
    },
    boardHint: { bonusCount: 5, penaltyCount: 2, eventCount: 4 },
  },
  {
    id: "roguelike",
    label: "Roguelike Hardcore",
    description: "Run, die, repeat — every roll is permadeath.",
    icon: "💀",
    heroIcon: "FireIcon",
    filters: {
      genres: ["indie", "action"],
      tags: ["roguelike", "roguelite", "difficult"],
      ordering: "-rating",
    },
    boardHint: { bonusCount: 2, penaltyCount: 6, eventCount: 5 },
  },
  {
    id: "cozy",
    label: "Cozy & Family",
    description: "Relaxed, colorful, everyone can play.",
    icon: "🌸",
    heroIcon: "HeartIcon",
    filters: {
      genres: ["family", "casual", "simulation"],
      tags: ["singleplayer"],
      esrb: ["everyone", "everyone-10-plus"],
      ordering: "-rating",
    },
    boardHint: { bonusCount: 6, penaltyCount: 1, eventCount: 3 },
  },
  {
    id: "esports",
    label: "Competitive / Multiplayer",
    description: "Fight, race, prove you are the best.",
    icon: "🏆",
    heroIcon: "TrophyIcon",
    filters: {
      genres: ["sports", "fighting", "racing", "shooter"],
      tags: ["multiplayer", "co-op"],
      players: "multi",
      ordering: "-added",
    },
    boardHint: { bonusCount: 4, penaltyCount: 4, eventCount: 2 },
  },
];

export function getTemplate(id: string | null | undefined): GamePoolTemplate | null {
  if (!id) return null;
  return GAME_POOL_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function applyTemplate(base: GamePoolFilters, templateId: string | null): GamePoolFilters {
  const tpl = getTemplate(templateId);
  if (!tpl) return base;
  return {
    ...base,
    ...tpl.filters,
    genres: tpl.filters.genres ?? base.genres,
    tags: tpl.filters.tags ?? base.tags,
    platforms: tpl.filters.platforms ?? base.platforms,
    esrb: tpl.filters.esrb ?? base.esrb,
  };
}
