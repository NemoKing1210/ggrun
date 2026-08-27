import type * as LeaderboardEn from "../en/leaderboard";
import type { Widen } from "@/lib/i18n/widen";

export const leaderboard: Widen<typeof LeaderboardEn.leaderboard> = {
  metaTitle: "Лідерборд — GGRun",
  pageTitle: "Лідерборд",
  empty: "У сезоні поки немає учасників.",
  columns: {
    place: "Місце",
    player: "Гравець",
    cell: "Клітинка",
    balance: "Баланс",
    streaks: "Стрики",
    status: "Статус",
  },
  kicker: "таблиця",
  champion: "Чемпіон",
  runnerUp: "Друге місце",
  thirdPlace: "Третє місце",
  progress: "Прогрес",
  cellLabel: "клітинка",
  viewProfile: "Профіль",
  stats: {
    leader: "Лідер",
    contenders: "Претенденти",
    total: "Всього гравців",
    boardSize: "Розмір поля",
  },
  emptyHint: "Долучайтесь до сезону, щоб зʼявитися тут.",
  abbrev: {
    points: "очк.",
    passDrop: "прохід / дроп",
    balanceShort: "Бал",
    passShort: "Прохід",
    dropShort: "Дроп",
  },
};
