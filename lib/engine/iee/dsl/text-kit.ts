/**
 * The small grammar the rule-text generator needs in three languages:
 * plurals, a few counted nouns, quoting and joining.
 *
 * Rule text is generated, never written by hand (spec §13), so it lives with
 * the vocabulary rather than in `lib/i18n/dictionaries`: a template belongs to
 * the primitive it describes, and the generator runs where the primitives do.
 * Parity across languages is enforced by the types below — every template is a
 * `Record<Locale, …>` — and by the text tests.
 */
import type { Locale } from "./doc";

/** CLDR plural categories as Russian and Ukrainian use them for integers. */
function slavicForm(n: number): 0 | 1 | 2 {
  const abs = Math.abs(n);
  const n10 = abs % 10;
  const n100 = abs % 100;
  if (n10 === 1 && n100 !== 11) return 0;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 1;
  return 2;
}

export type Noun = {
  en: readonly [one: string, other: string];
  ru: readonly [one: string, few: string, many: string];
  uk: readonly [one: string, few: string, many: string];
};

/**
 * Counted nouns in the case the templates use them: accusative after a
 * number ("на 2 клетки", "получаете 3 очка", "действует 5 бросков").
 */
export const NOUNS = {
  cell: { en: ["cell", "cells"], ru: ["клетку", "клетки", "клеток"], uk: ["клітинку", "клітинки", "клітинок"] },
  side: { en: ["side", "sides"], ru: ["грань", "грани", "граней"], uk: ["грань", "грані", "граней"] },
  die: { en: ["die", "dice"], ru: ["кубик", "кубика", "кубиков"], uk: ["кубик", "кубики", "кубиків"] },
  point: { en: ["point", "points"], ru: ["очко", "очка", "очков"], uk: ["очко", "очки", "очок"] },
  roll: { en: ["roll", "rolls"], ru: ["бросок", "броска", "бросков"], uk: ["кидок", "кидки", "кидків"] },
  move: { en: ["move", "moves"], ru: ["ход", "хода", "ходов"], uk: ["хід", "ходи", "ходів"] },
  game: { en: ["game", "games"], ru: ["игру", "игры", "игр"], uk: ["гру", "гри", "ігор"] },
  condition: {
    en: ["completion condition", "completion conditions"],
    ru: ["условие прохождения", "условия прохождения", "условий прохождения"],
    uk: ["умову проходження", "умови проходження", "умов проходження"],
  },
  object: { en: ["object", "objects"], ru: ["объект", "объекта", "объектов"], uk: ["об'єкт", "об'єкти", "об'єктів"] },
  time: { en: ["time", "times"], ru: ["раз", "раза", "раз"], uk: ["раз", "рази", "разів"] },
} as const satisfies Record<string, Noun>;

export type NounKey = keyof typeof NOUNS;

/** The noun form a number takes. */
export function plural(locale: Locale, n: number, noun: Noun): string {
  if (locale === "en") return Math.abs(n) === 1 ? noun.en[0] : noun.en[1];
  return noun[locale][slavicForm(n)];
}

/** "2 cells", "1–3 клетки" — a range takes the form of its upper bound. */
export function counted(locale: Locale, min: number, max: number, noun: Noun): string {
  const lo = Math.abs(min);
  const hi = Math.abs(max);
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  const number = a === b ? `${a}` : `${a}–${b}`;
  return `${number} ${plural(locale, b, noun)}`;
}

/** An entry name as it appears inside a sentence. */
export function quote(locale: Locale, name: string): string {
  return locale === "en" ? `“${name}”` : `«${name}»`;
}

const AND: Record<Locale, string> = { en: " and ", ru: " и ", uk: " і " };
const OR: Record<Locale, string> = { en: " or ", ru: " или ", uk: " або " };

/** "a, b and c". */
export function joinAnd(locale: Locale, parts: readonly string[]): string {
  return joinWith(parts, AND[locale]);
}

/** "a, b or c". */
export function joinOr(locale: Locale, parts: readonly string[]): string {
  return joinWith(parts, OR[locale]);
}

function joinWith(parts: readonly string[], last: string): string {
  const list = parts.filter((p) => p.length > 0);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")}${last}${list[list.length - 1]}`;
}

/** First letter upper-case — sentences are assembled from lower-case clauses. */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Ends a sentence once, whatever the clause already ended with. */
export function sentence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length === 0) return "";
  return /[.!?]$/.test(trimmed) ? capitalize(trimmed) : `${capitalize(trimmed)}.`;
}
