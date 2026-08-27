/** Home page (/). */
export const landing = {
  metaTitle: "GGRun — game run",
  currentSeason: "// current season",
  startedAt: "Start:",
  uptime: "In run:",
  topHeading: "Top 5",
  fullTableLink: "full table →",
  emptyTop: "No participants yet.",
  cellShort: "cl.{position}",
  latestHeading: "Latest events",
  fullFeedLink: "full feed →",
  sections: {
    board: { label: "Board", hint: "season map and player positions" },
    leaderboard: { label: "Leaderboard", hint: "the full standings table" },
    feed: { label: "Feed", hint: "every event of the season" },
    rules: { label: "Rules", hint: "how to play" },
  },
} as const;
