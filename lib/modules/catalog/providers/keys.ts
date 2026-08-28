import { getSiteSettings } from "@/lib/modules/site-settings/repository/site-settings";

export type ProviderKeys = {
  rawgApiKey: string | null;
  igdbClientId: string | null;
  igdbClientSecret: string | null;
  steamApiKey: string | null;
  gamespotApiKey: string | null;
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

/**
 * Effective keys: DB value wins when non-empty, otherwise env.
 * Caches per-request via React cache is not needed; callers should cache if needed.
 */
export async function getEffectiveProviderKeys(): Promise<ProviderKeys> {
  const env: ProviderKeys = {
    rawgApiKey: trimOrNull(process.env.RAWG_API_KEY),
    igdbClientId: trimOrNull(process.env.IGDB_CLIENT_ID),
    igdbClientSecret: trimOrNull(process.env.IGDB_CLIENT_SECRET),
    steamApiKey: trimOrNull(process.env.STEAM_WEB_API_KEY),
    gamespotApiKey: trimOrNull(process.env.GAMESPOT_API_KEY),
  };

  try {
    const settings = await getSiteSettings();
    // Narrow to new columns; may be undefined on old rows
    const s = settings as unknown as Record<string, unknown>;
    const dbRawg = trimOrNull(s.rawgApiKey);
    const dbIgdbId = trimOrNull(s.igdbClientId);
    const dbIgdbSecret = trimOrNull(s.igdbClientSecret);
    const dbSteam = trimOrNull(s.steamApiKey);
    const dbGameSpot = trimOrNull(s.gamespotApiKey);
    return {
      rawgApiKey: dbRawg ?? env.rawgApiKey,
      igdbClientId: dbIgdbId ?? env.igdbClientId,
      igdbClientSecret: dbIgdbSecret ?? env.igdbClientSecret,
      steamApiKey: dbSteam ?? env.steamApiKey,
      gamespotApiKey: dbGameSpot ?? env.gamespotApiKey,
    };
  } catch {
    return env;
  }
}

export async function isProviderConfiguredAsync(provider: string): Promise<boolean> {
  const k = await getEffectiveProviderKeys();
  if (provider === "rawg") return Boolean(k.rawgApiKey);
  if (provider === "igdb") return Boolean(k.igdbClientId && k.igdbClientSecret);
  if (provider === "steam") return Boolean(k.steamApiKey);
  if (provider === "gamespot") return Boolean(k.gamespotApiKey);
  if (provider === "freetogame") return true; // no key required
  return true;
}

export async function listAvailableProviders(): Promise<Array<{ id: string; label: string }>> {
  const k = await getEffectiveProviderKeys();
  const out: Array<{ id: string; label: string }> = [];
  // FreeToGame works without any key — always available.
  out.push({ id: "freetogame", label: "FreeToGame" });
  if (k.rawgApiKey) out.push({ id: "rawg", label: "RAWG" });
  if (k.igdbClientId && k.igdbClientSecret) out.push({ id: "igdb", label: "IGDB" });
  if (k.steamApiKey) out.push({ id: "steam", label: "Steam" });
  if (k.gamespotApiKey) out.push({ id: "gamespot", label: "GameSpot" });
  return out;
}

/**
 * Mask a secret for display: show last 4 chars, rest as •. Returns null if empty.
 */
export function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const t = key.trim();
  if (!t) return null;
  if (t.length <= 4) return "••••";
  return `••••${t.slice(-4)}`;
}
