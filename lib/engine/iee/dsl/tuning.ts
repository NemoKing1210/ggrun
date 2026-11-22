/**
 * A season's tuning of an entry, applied — the numbers an instance starts
 * with and the view the client shows.
 *
 * The tuning lives on the season's catalog row (spec §4.2) and the rules are
 * the ones here, so a wheel drop, an item and a challenge reward cannot
 * disagree about how strong or how long the same entry is.
 */
import { NO_ART, type EntryArt, type EntryView, type IeeParams } from "../../types/iee";
import type { EntryDoc } from "./doc";
import { isEffect, type CompiledDuration, type CompiledEntry, type EntryFacts } from "./runtime";
import { ruleText } from "./text";
import { resolveParamOverrides, type OverrideProblem } from "./values";

/** The two numbers a season's catalog row changes about an instance. */
export interface EntryTuning {
  paramOverrides?: IeeParams;
  /**
   * Effects: the duration's count. Items: the charge count — one column
   * with two meanings, as the catalog row has one (spec §4.2).
   */
  durationOverride?: number | null;
}

export interface InstanceStart {
  /** Parameter snapshot: declared defaults with valid overrides applied. */
  params: IeeParams;
  /** Overrides that were not applied, for the staff log. */
  problems: OverrideProblem[];
  /**
   * Items: an active one's uses, a passive or cursed one's firings before it
   * vanishes. Null for effects, and for a passive item that stays while held.
   */
  charges: number | null;
  /**
   * Effects: the counter and its unit. Null for items; `remaining` null =
   * permanent. An instant effect keeps no counter: both are null.
   */
  remaining: number | null;
  unit: Exclude<CompiledDuration["unit"], "instant"> | null;
}

export function instanceStart(entry: CompiledEntry, tuning?: EntryTuning): InstanceStart {
  const { params, problems } = resolveParamOverrides(entry.params, tuning?.paramOverrides);
  const override = tuning?.durationOverride ?? null;
  if (!isEffect(entry)) {
    const base = entry.usage.charges;
    const charges = base === null && override === null ? null : Math.max(1, override ?? base ?? 1);
    return { params, problems, charges, remaining: null, unit: null };
  }
  const { unit, count } = entry.duration;
  if (unit === "instant") return { params, problems, charges: null, remaining: null, unit: null };
  if (unit === "permanent") return { params, problems, charges: null, remaining: null, unit };
  // One game, whatever a season tunes: there is no count to change (spec §6.4).
  if (unit === "next_game") return { params, problems, charges: null, remaining: 1, unit };
  return { params, problems, charges: null, remaining: Math.max(1, override ?? count ?? 1), unit };
}

/** The document as the season plays it, for the rule text: tuned counts in place. */
function tunedDoc(entry: CompiledEntry, start: InstanceStart): EntryDoc {
  const doc = entry.doc;
  if (doc.kind === "item" && doc.usage && start.charges !== null) {
    return { ...doc, usage: { ...doc.usage, charges: start.charges } };
  }
  if (doc.kind === "effect" && doc.duration && doc.duration.unit !== "next_game" && start.remaining !== null) {
    return { ...doc, duration: { ...doc.duration, count: start.remaining } };
  }
  return doc;
}

/** Serializable view of an entry under a season's tuning (spec §8), drawn with `art` (spec §12). */
export function entryView(
  entry: CompiledEntry,
  resolve: (entryId: string) => EntryFacts | null,
  tuning?: EntryTuning,
  art: EntryArt = NO_ART,
): EntryView {
  const start = instanceStart(entry, tuning);
  const tuned = tuning === undefined ? entry.ruleText : ruleText(tunedDoc(entry, start), { params: start.params, resolve });
  return {
    revisionId: entry.revisionId,
    entryId: entry.entryId,
    key: entry.key,
    kind: entry.kind,
    name: entry.names,
    ruleText: tuned,
    flavor: entry.flavor,
    glyph: entry.glyph,
    character: entry.character,
    polarity: entry.polarity,
    rarity: entry.rarity,
    tags: entry.tags,
    usage: isEffect(entry)
      ? null
      : {
          activation: entry.usage.activation,
          window: entry.usage.window,
          target: entry.usage.target,
          charges: start.charges,
          filter: entry.usage.filter,
          choice: entry.usage.choice,
          entryChoice: entry.usage.entryChoice,
          pick: entry.usage.pick,
          unique: entry.usage.unique,
        },
    duration: isEffect(entry) ? { unit: entry.duration.unit, count: start.remaining } : null,
    stacking: isEffect(entry) ? entry.stacking.mode : null,
    triggers: [...new Set(entry.doc.rules.map((rule) => rule.when))],
    art,
  };
}
