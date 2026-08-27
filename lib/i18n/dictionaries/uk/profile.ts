import type * as ProfileEn from "../en/profile";
import type { Widen } from "@/lib/i18n/widen";

export const profile: Widen<typeof ProfileEn.profile> = {
  listing: {
    metaTitle: "Гравці — GGRun",
    title: "Гравці",
    kicker: "склад",
    description: "Усі зареєстровані бійці — знайдіть тіммейтів, суперників і легенд.",
    searchPlaceholder: "Пошук за імʼям або ніком…",
    roleAll: "Усі ролі",
    count: "{count} бійців",
    empty: "Нікого не знайдено за вашим запитом.",
    emptyHint: "Спробуйте інше імʼя або скиньте фільтри.",
    viewProfile: "Профіль",
    joined: "З нами з {date}",
  },
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
