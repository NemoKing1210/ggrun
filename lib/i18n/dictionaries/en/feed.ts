/** Лента событий (/feed). */
export const feed = {
  metaTitle: "Feed — GGRun",
  pageTitle: "Event feed",
  empty: "No events yet — the season is just getting started.",
  fallbackPlayer: "Player",
  unknownTitle: "???",
  actions: {
    rolled: " rolled a game: “{title}”",
    rerolled: " rerolled → “{title}”",
    passed: " passed the game",
    dropped: " dropped the game",
    movedFrom: ": cell {from} → ",
    joined: " joined the season",
  },
  diceSuffix: "(dice {dice})",
  seasonStarted: "The season has started. Good luck, everyone!",
  adminAdjustmentPrefix: "Administrative adjustment for ",
  adminAdjustmentReason: ": {reason}",
  defaultEvent: "Event: {type}",
} as const;
