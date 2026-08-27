import type * as LeaderboardEn from "../en/leaderboard";
import type { Widen } from "@/lib/i18n/widen";

export const leaderboard: Widen<typeof LeaderboardEn.leaderboard> = {
  metaTitle: "Лидерборд — GGRun",
  pageTitle: "Лидерборд",
  empty: "В сезоне пока нет участников.",
  columns: {
    place: "Место",
    player: "Игрок",
    cell: "Клетка",
    balance: "Баланс",
    streaks: "Стрики",
    status: "Статус",
  },
  kicker: "таблица",
  champion: "Чемпион",
  runnerUp: "Второе место",
  thirdPlace: "Третье место",
  progress: "Прогресс",
  cellLabel: "клетка",
  viewProfile: "Профиль",
  stats: {
    leader: "Лидер",
    contenders: "Претенденты",
    total: "Всего игроков",
    boardSize: "Размер поля",
  },
  emptyHint: "Вступите в сезон, чтобы появиться здесь.",
  abbrev: {
    points: "очк.",
    passDrop: "проход / дроп",
    balanceShort: "Бал",
    passShort: "Проход",
    dropShort: "Дроп",
  },
};
