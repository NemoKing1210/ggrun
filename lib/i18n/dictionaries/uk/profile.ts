import type * as ProfileEn from "../en/profile";
import type { Widen } from "@/lib/i18n/widen";

export const profile: Widen<typeof ProfileEn.profile> = {
  metaTitle: "@{username} — GGRun",
  streak: "стрик",
  balance: "баланс",
  rollStats: {
    rolled: "Витягнуто ігор",
    in_progress: "У процесі",
    passed: "Пройдено",
    dropped: "Дропнуто",
    rerolled: "Перекидань",
  },
  seasonsHeading: "Сезони",
  emptySeasons: "Гравець поки не брав участі в сезонах.",
  cell: "клітинка",
  movesHeading: "Останні ходи",
  emptyMoves: "Ходів у поточному сезоні ще не було.",
};
