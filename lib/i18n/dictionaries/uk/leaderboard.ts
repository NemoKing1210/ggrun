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
};
