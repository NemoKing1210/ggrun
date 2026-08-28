import type { GameProvider } from "./provider";
import { rawgProvider } from "./rawg";
import { freetogameProvider } from "./freetogame";
import { gamespotProvider } from "./gamespot";

const IGDB_PLACEHOLDER: GameProvider = {
  id: "igdb",
  async search() {
    console.warn("[igdb] provider not configured, returning empty");
    return [];
  },
  async getById() {
    return null;
  },
};

const STEAM_PLACEHOLDER: GameProvider = {
  id: "steam",
  async search() {
    console.warn("[steam] provider not configured, returning empty");
    return [];
  },
  async getById() {
    return null;
  },
};

const INTERNAL_PLACEHOLDER: GameProvider = {
  id: "internal",
  async search() {
    return [];
  },
  async getById() {
    return null;
  },
};

export function getProvider(id: string): GameProvider {
  switch (id) {
    case "rawg":
      return rawgProvider;
    case "freetogame":
      return freetogameProvider;
    case "gamespot":
      return gamespotProvider;
    case "igdb":
      return IGDB_PLACEHOLDER;
    case "steam":
      return STEAM_PLACEHOLDER;
    default:
      return INTERNAL_PLACEHOLDER;
  }
}

export { rawgProvider, freetogameProvider, gamespotProvider };
export type { ExternalGame, GameProvider } from "./provider";
