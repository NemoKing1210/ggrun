import type * as FeedEn from "../en/feed";
import type { Widen } from "@/lib/i18n/widen";

export const feed: Widen<typeof FeedEn.feed> = {
  metaTitle: "Стрічка — GGRun",
  pageTitle: "Стрічка подій",
  empty: "Подій поки немає — сезон тільки починається.",
  fallbackPlayer: "Гравець",
  unknownTitle: "???",
  actions: {
    rolled: " витягнув гру: «{title}»",
    rerolled: " перекинув гру → «{title}»",
    passed: " пройшов гру",
    dropped: " дропнув гру",
    movedFrom: ": клітинка {from} → ",
    joined: " приєднався до сезону",
  },
  diceSuffix: "(кубики {dice})",
  seasonStarted: "Сезон почався. Усім удачі!",
  adminAdjustmentPrefix: "Адміністративне коригування для ",
  adminAdjustmentReason: ": {reason}",
  defaultEvent: "Подія: {type}",
};
