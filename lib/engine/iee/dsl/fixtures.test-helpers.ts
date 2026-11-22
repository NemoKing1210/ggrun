/**
 * Shared builders for the DSL tests. Not a test file itself (no `.test.`
 * suffix in the stem), and not shipped: nothing outside `*.test.ts` imports it.
 */
import type { IeePlayerSnapshot } from "../../types/iee";
import type { EntryDoc } from "./doc";
import type { EntryFacts, RuleContext } from "./runtime";

export const IDS = {
  slowed: "11111111-1111-4111-8111-111111111111",
  tailwind: "22222222-2222-4222-8222-222222222222",
  hex: "33333333-3333-4333-8333-333333333333",
  salve: "44444444-4444-4444-8444-444444444444",
  gift: "55555555-5555-4555-8555-555555555555",
  self: "66666666-6666-4666-8666-666666666666",
} as const;

export const FACTS: Record<string, EntryFacts> = {
  [IDS.slowed]: {
    entryId: IDS.slowed,
    slug: "slowed",
    kind: "effect",
    character: "penalty",
    tags: ["movement"],
    name: { ru: "Замедление", en: "Slowed", uk: "Уповільнення" },
  },
  [IDS.tailwind]: {
    entryId: IDS.tailwind,
    slug: "tailwind",
    kind: "effect",
    character: "bonus",
    tags: ["movement"],
    name: { ru: "Попутный ветер", en: "Tailwind", uk: "Попутний вітер" },
  },
  [IDS.salve]: {
    entryId: IDS.salve,
    slug: "cleansing_salve",
    kind: "item",
    character: "bonus",
    tags: [],
    name: { ru: "Очищающая мазь", en: "Cleansing Salve" },
  },
};

export const resolve = (entryId: string): EntryFacts | null => FACTS[entryId] ?? null;

export function player(id: string, over: Partial<IeePlayerSnapshot> = {}): IeePlayerSnapshot {
  return {
    seasonPlayerId: id,
    position: 10,
    balancePoints: 5,
    rollSeq: 3,
    moveCount: 4,
    rank: 2,
    status: "active",
    ...over,
  };
}

/** A sequence of rng values, repeating the last one. */
export function rngOf(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

export function ctx(over: Partial<RuleContext> = {}): RuleContext {
  return {
    trigger: "afterMovement",
    params: {},
    self: player("sp-me"),
    target: null,
    turn: { rollSeq: 4, outcome: "passed" },
    selfEntries: [],
    targetEntries: [],
    rng: rngOf(0.5),
    ...over,
  };
}

export function effectDoc(over: Partial<EntryDoc> = {}): EntryDoc {
  return {
    dslVersion: 1,
    kind: "effect",
    slug: "test_effect",
    name: { ru: "Тест", en: "Test", uk: "Тест" },
    character: "penalty",
    rarity: "common",
    tags: ["movement"],
    duration: { unit: "rolls", count: 2 },
    stacking: { mode: "refresh" },
    rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }],
    ...over,
  };
}

export function itemDoc(over: Partial<EntryDoc> = {}): EntryDoc {
  return {
    dslVersion: 1,
    kind: "item",
    slug: "test_item",
    name: { ru: "Предмет", en: "Item", uk: "Предмет" },
    character: "bonus",
    rarity: "common",
    tags: ["directed"],
    usage: { activation: "active", window: "anytime", target: { who: "other" }, charges: 1 },
    rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: IDS.slowed, slug: "slowed" }, to: "target" }] }],
    ...over,
  };
}
