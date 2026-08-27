import type * as FeedEn from "../en/feed";
import type { Widen } from "@/lib/i18n/widen";

export const feed: Widen<typeof FeedEn.feed> = {
  metaTitle: "Лента — GGRun",
  pageTitle: "Лента событий",
  kicker: "прямой эфир",
  empty: "Событий пока нет — сезон только начинается.",
  emptyHint: "Роллы, ходы и вступления появятся здесь в реальном времени.",
  fallbackPlayer: "Игрок",
  unknownTitle: "???",
  actions: {
    rolled: " выбросил игру: «{title}»",
    rerolled: " перебросил игру → «{title}»",
    passed: " прошёл игру",
    dropped: " дропнул игру",
    movedFrom: ": клетка {from} → ",
    joined: " присоединился к сезону",
  },
  diceSuffix: "(кубики {dice})",
  seasonStarted: "Сезон начался. Всем удачи!",
  adminAdjustmentPrefix: "Административная корректировка для ",
  adminAdjustmentReason: ": {reason}",
  defaultEvent: "Событие: {type}",
  filters: {
    all: "Все",
    rolled: "Роллы",
    passed: "Пассы",
    dropped: "Дропы",
    moved: "Ходы",
    joined: "Вступления",
    system: "Система",
  },
  live: "LIVE",
  today: "Сегодня",
  yesterday: "Вчера",
  noFilterResults: "Нет событий по этому фильтру.",
  clearFilter: "Сбросить фильтр",
  stats: {
    events: "событий",
    players: "активных игроков",
  },
};
