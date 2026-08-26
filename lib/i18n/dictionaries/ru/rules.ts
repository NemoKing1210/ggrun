import type * as RulesEn from "../en/rules";
import type { Widen } from "@/lib/i18n/widen";

export const rules: Widen<typeof RulesEn.rules> = {
  metaTitle: "Правила — GGRun",
  pageTitle: "Правила",
  empty: "Правила сезона ещё не опубликованы.",
};
