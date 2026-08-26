import type * as FeedEn from "../en/feed";
import type { Widen } from "@/lib/i18n/widen";

export const feed: Widen<typeof FeedEn.feed> = {
  metaTitle: "Лента — GGRun",
  pageTitle: "Лента событий",
  empty: "Событий пока нет — сезон только начинается.",
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
};
