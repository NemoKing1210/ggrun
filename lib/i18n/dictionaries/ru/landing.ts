import type * as LandingEn from "../en/landing";
import type { Widen } from "@/lib/i18n/widen";

export const landing: Widen<typeof LandingEn.landing> = {
  metaTitle: "GGRun — игровой забег",
  currentSeason: "// текущий сезон",
  startedAt: "Старт:",
  uptime: "В забеге:",
  topHeading: "Топ-5",
  fullTableLink: "вся таблица",
  emptyTop: "Участников ещё нет.",
  cellShort: "кл.{position}",
  latestHeading: "Последние события",
  fullFeedLink: "вся лента",
  sections: {
    board: { label: "Поле", hint: "карта сезона и позиции игроков" },
    leaderboard: { label: "Лидерборд", hint: "полная таблица standings" },
    feed: { label: "Лента", hint: "все события сезона" },
    rules: { label: "Правила", hint: "как играть" },
  },
};
