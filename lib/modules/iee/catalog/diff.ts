/**
 * What switching a season to another revision of an entry changes (spec
 * §4.2: "switching a season to a newer revision is an explicit staff action
 * with a diff") — said in the terms a player meets the entry in: its name,
 * what it does, how rare it is, how it is used or how long it lasts.
 *
 * Pure: the season wizard computes it in the browser from the two revisions'
 * views. No database here.
 */
import type { EntryView, IeeLocaleText } from "@/lib/engine";

import type { RevisionOption } from "./views";

const LOCALES = ["ru", "en", "uk"] as const;
type Locale = (typeof LOCALES)[number];

export interface Change<T> {
  from: T;
  to: T;
}

export interface RevisionDiff {
  /** Per locale, only where the text differs. */
  name: (Change<string> & { locale: Locale })[];
  ruleText: (Change<string> & { locale: Locale })[];
  flavor: (Change<string> & { locale: Locale })[];
  character?: Change<EntryView["character"]>;
  rarity?: Change<EntryView["rarity"]>;
  tags?: { added: string[]; removed: string[] };
  usage?: Change<EntryView["usage"]>;
  duration?: Change<EntryView["duration"]>;
  stacking?: Change<EntryView["stacking"]>;
  power?: Change<number | null>;
  /** Nothing a player or the season sees differs — only the document's internals. */
  same: boolean;
}

function texts(from: IeeLocaleText, to: IeeLocaleText): (Change<string> & { locale: Locale })[] {
  return LOCALES.filter((l) => from[l] !== to[l]).map((locale) => ({ locale, from: from[locale], to: to[locale] }));
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function revisionDiff(from: RevisionOption, to: RevisionOption): RevisionDiff | null {
  const a = from.view;
  const b = to.view;
  if (!a || !b) return null;
  const none = { ru: "", en: "", uk: "" };
  const diff: RevisionDiff = {
    name: texts(a.name, b.name),
    ruleText: texts(a.ruleText, b.ruleText),
    flavor: texts(a.flavor ?? none, b.flavor ?? none),
    same: false,
  };
  if (a.character !== b.character) diff.character = { from: a.character, to: b.character };
  if (a.rarity !== b.rarity) diff.rarity = { from: a.rarity, to: b.rarity };
  const added = b.tags.filter((t) => !a.tags.includes(t));
  const removed = a.tags.filter((t) => !b.tags.includes(t));
  if (added.length > 0 || removed.length > 0) diff.tags = { added, removed };
  if (!equal(a.usage, b.usage)) diff.usage = { from: a.usage, to: b.usage };
  if (!equal(a.duration, b.duration)) diff.duration = { from: a.duration, to: b.duration };
  if (a.stacking !== b.stacking) diff.stacking = { from: a.stacking, to: b.stacking };
  if (from.power !== to.power) diff.power = { from: from.power, to: to.power };
  diff.same =
    diff.name.length === 0 &&
    diff.ruleText.length === 0 &&
    diff.flavor.length === 0 &&
    !diff.character &&
    !diff.rarity &&
    !diff.tags &&
    !diff.usage &&
    !diff.duration &&
    !diff.stacking &&
    !diff.power;
  return diff;
}
