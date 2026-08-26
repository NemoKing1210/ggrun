import type * as BoardEn from "../en/board";
import type { Widen } from "@/lib/i18n/widen";

export const board: Widen<typeof BoardEn.board> = {
  metaTitle: "Поле — GGRun",
  pageTitle: "Поле",
  emptyNoBoard: "Поле сезону ще не створено.",
  emptyNoCells: "Поле ще не розмічене — клітинки з’являться пізніше.",
  missing: {
    title: "Сезон не оголошено",
    text: "Ведучі ще не запустили новий сезон. Завітай пізніше або вивчи минулі розділи платформи.",
    sections: {
      board: { label: "Поле", hint: "карта забігу" },
      leaderboard: { label: "Лідерборд", hint: "хто де стоїть" },
      feed: { label: "Стрічка", hint: "що сталося" },
      rules: { label: "Правила", hint: "як грати" },
    },
  },
};
