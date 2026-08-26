/** Публичный профиль игрока (/players/<username>). */
export const profile = {
  metaTitle: "@{username} — GGRun",
  streak: "streak",
  balance: "balance",
  rollStats: {
    rolled: "Games rolled",
    in_progress: "In progress",
    passed: "Passed",
    dropped: "Dropped",
    rerolled: "Rerolls",
  },
  seasonsHeading: "Seasons",
  emptySeasons: "This player has not taken part in any seasons yet.",
  cell: "cell",
  movesHeading: "Recent moves",
  emptyMoves: "No moves in the current season yet.",
} as const;
