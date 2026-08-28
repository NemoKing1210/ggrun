/**
 * Selectable options for the flexible game-pool filters.
 * Values match RAWG / IGDB conventions where applicable to keep provider mapping trivial.
 */

export const PLATFORMS = [
  { value: "pc", label: "PC", rawgId: "4" },
  { value: "playstation5", label: "PlayStation 5", rawgId: "187" },
  { value: "playstation4", label: "PlayStation 4", rawgId: "18" },
  { value: "xbox-series-x", label: "Xbox Series X", rawgId: "186" },
  { value: "xbox-one", label: "Xbox One", rawgId: "1" },
  { value: "nintendo-switch", label: "Nintendo Switch", rawgId: "7" },
  { value: "nintendo-3ds", label: "Nintendo 3DS", rawgId: "8" },
  { value: "ios", label: "iOS", rawgId: "3" },
  { value: "android", label: "Android", rawgId: "21" },
  { value: "mac", label: "macOS", rawgId: "5" },
  { value: "linux", label: "Linux", rawgId: "6" },
  { value: "ps-vita", label: "PS Vita", rawgId: "19" },
  { value: "web", label: "Web", rawgId: "171" },
] as const;

export const GENRES = [
  { value: "action", label: "Action" },
  { value: "adventure", label: "Adventure" },
  { value: "rpg", label: "RPG" },
  { value: "strategy", label: "Strategy" },
  { value: "shooter", label: "Shooter" },
  { value: "puzzle", label: "Puzzle" },
  { value: "arcade", label: "Arcade" },
  { value: "platformer", label: "Platformer" },
  { value: "racing", label: "Racing" },
  { value: "sports", label: "Sports" },
  { value: "simulation", label: "Simulation" },
  { value: "fighting", label: "Fighting" },
  { value: "family", label: "Family" },
  { value: "board-games", label: "Board Games" },
  { value: "card", label: "Card" },
  { value: "casual", label: "Casual" },
  { value: "indie", label: "Indie" },
  { value: "massively-multiplayer", label: "MMO" },
  { value: "educational", label: "Educational" },
] as const;

export const TAGS = [
  { value: "horror", label: "Horror" },
  { value: "survival", label: "Survival" },
  { value: "open-world", label: "Open World" },
  { value: "roguelike", label: "Roguelike" },
  { value: "roguelite", label: "Roguelite" },
  { value: "pixel-graphics", label: "Pixel Graphics" },
  { value: "sci-fi", label: "Sci-Fi" },
  { value: "fantasy", label: "Fantasy" },
  { value: "co-op", label: "Co-op" },
  { value: "multiplayer", label: "Multiplayer" },
  { value: "singleplayer", label: "Singleplayer" },
  { value: "story-rich", label: "Story Rich" },
  { value: "atmospheric", label: "Atmospheric" },
  { value: "difficult", label: "Difficult" },
  { value: "retro", label: "Retro" },
  { value: "zombie", label: "Zombie" },
  { value: "stealth", label: "Stealth" },
  { value: "crafting", label: "Crafting" },
  { value: "farming", label: "Farming" },
  { value: "cyberpunk", label: "Cyberpunk" },
] as const;

export const ESRB = [
  { value: "everyone", label: "Everyone" },
  { value: "everyone-10-plus", label: "Everyone 10+" },
  { value: "teen", label: "Teen" },
  { value: "mature", label: "Mature 17+" },
  { value: "adults-only", label: "Adults Only 18+" },
  { value: "rating-pending", label: "Rating Pending" },
] as const;

export const ORDERINGS = [
  { value: "-metacritic", label: "Metacritic ↓" },
  { value: "metacritic", label: "Metacritic ↑" },
  { value: "-rating", label: "Rating ↓" },
  { value: "-released", label: "Newest first" },
  { value: "released", label: "Oldest first" },
  { value: "-added", label: "Popularity ↓" },
  { value: "name", label: "Name A-Z" },
  { value: "-name", label: "Name Z-A" },
] as const;

export const GAME_POOL_SOURCES = [
  { value: "catalog", label: "Local catalog only" },
  { value: "api", label: "External API only" },
  { value: "hybrid", label: "Hybrid (catalog + API)" },
] as const;

export const GAME_PROVIDERS = [
  { value: "internal", label: "Internal (catalog)" },
  { value: "rawg", label: "RAWG" },
  { value: "freetogame", label: "FreeToGame" },
  { value: "igdb", label: "IGDB" },
  { value: "steam", label: "Steam" },
  { value: "gamespot", label: "GameSpot" },
] as const;

export const BOARD_DISTRIBUTIONS = [
  { value: "random", label: "Random" },
  { value: "even", label: "Even spread" },
  { value: "clustered", label: "Clustered" },
  { value: "manual", label: "Manual only" },
] as const;
