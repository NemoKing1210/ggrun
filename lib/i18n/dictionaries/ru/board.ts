import type * as BoardEn from "../en/board";
import type { Widen } from "@/lib/i18n/widen";

export const board: Widen<typeof BoardEn.board> = {
  metaTitle: "Поле — GGRun",
  pageTitle: "Поле",
  emptyNoBoard: "Поле сезона ещё не создано.",
  emptyNoCells: "Поле пока не размечено — клетки появятся позже.",
  missing: {
    title: "Сезон не объявлен",
    text: "Ведущие ещё не запустили новый сезон. Заглядывай позже или изучи прошлые разделы платформы.",
    sections: {
      board: { label: "Поле", hint: "карта забега" },
      leaderboard: { label: "Лидерборд", hint: "кто где стоит" },
      feed: { label: "Лента", hint: "что произошло" },
      rules: { label: "Правила", hint: "как играть" },
    },
  },
};
