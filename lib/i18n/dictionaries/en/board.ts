/** Board page (/board) and the "no season" placeholder. */
export const board = {
  metaTitle: "Board — GGRun",
  pageTitle: "Board",
  emptyNoBoard: "The season board has not been created yet.",
  emptyNoCells: "The board has no cells yet — they will appear later.",
  missing: {
    title: "No season announced",
    text: "The hosts have not launched a new season yet. Check back later or explore the other sections of the platform.",
    sections: {
      board: { label: "Board", hint: "map of the run" },
      leaderboard: { label: "Leaderboard", hint: "who stands where" },
      feed: { label: "Feed", hint: "what happened" },
      rules: { label: "Rules", hint: "how to play" },
    },
  },
} as const;
