import type * as ProfileEn from "../en/profile";
import type { Widen } from "@/lib/i18n/widen";

export const profile: Widen<typeof ProfileEn.profile> = {
  metaTitle: "@{username} — GGRun",
  streak: "стрик",
  balance: "баланс",
  rollStats: {
    rolled: "Выброшено игр",
    in_progress: "В процессе",
    passed: "Пройдено",
    dropped: "Дропнуто",
    rerolled: "Перебросов",
  },
  seasonsHeading: "Сезоны",
  emptySeasons: "Игрок пока не участвовал в сезонах.",
  cell: "клетка",
  movesHeading: "Последние ходы",
  emptyMoves: "Ходов в текущем сезоне ещё не было.",
};
