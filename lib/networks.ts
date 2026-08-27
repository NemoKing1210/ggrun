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
