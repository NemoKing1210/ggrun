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
};
