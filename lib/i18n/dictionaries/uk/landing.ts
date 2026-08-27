import type * as LandingEn from "../en/landing";
import type { Widen } from "@/lib/i18n/widen";

export const landing: Widen<typeof LandingEn.landing> = {
  metaTitle: "GGRun — ігровий забіг",
  currentSeason: "// поточний сезон",
  startedAt: "Старт:",
  uptime: "У забігу:",
  topHeading: "Топ-5",
  fullTableLink: "вся таблиця →",
  emptyTop: "Учасників ще немає.",
  cellShort: "кл.{position}",
  latestHeading: "Останні події",
  fullFeedLink: "вся лента →",
  sections: {
    board: { label: "Поле", hint: "карта сезону й позиції гравців" },
    leaderboard: { label: "Лідерборд", hint: "повна таблиця standings" },
    feed: { label: "Стрічка", hint: "усі події сезону" },
    rules: { label: "Правила", hint: "як грати" },
  },
};
