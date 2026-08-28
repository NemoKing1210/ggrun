/** External profile networks selectable in user settings. Pure constants — importable from client code. */
export const NETWORKS = [
  "twitch",
  "steam",
  "discord",
  "github",
  "x",
  "youtube",
  "custom",
] as const;

export type Network = (typeof NETWORKS)[number];

export const NETWORK_HOSTS: Record<Network, readonly string[]> = {
  twitch: ["twitch.tv"],
  steam: ["steamcommunity.com", "store.steampowered.com"],
  discord: ["discord.gg", "discord.com", "discordapp.com"],
  github: ["github.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be", "m.youtube.com"],
  custom: [],
};

export function isValidUrlForNetwork(network: Network, rawUrl: string): boolean {
  if (network === "custom") return true;
  const trimmed = rawUrl.trim();
  if (!trimmed) return true;
  try {
    const { hostname } = new URL(trimmed);
    const host = hostname.toLowerCase();
    const allowed = NETWORK_HOSTS[network] ?? [];
    return allowed.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
