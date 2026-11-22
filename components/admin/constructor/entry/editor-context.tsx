"use client";

import { createContext, useContext } from "react";

import type { EntryDoc, Issue, ScenarioEntry } from "@/lib/engine/iee/dsl";
import { useI18n } from "@/lib/i18n/client";
import { issueSpot, type DraftAnalysis, type IssueSpot } from "@/lib/modules/iee/library/draft";
import type { ScenarioVerdict } from "@/lib/modules/iee/library/scenario-draft";
import type { RefOption } from "@/lib/modules/iee/library/screens";

/** What every block of the entry editor works with. */
export interface EditorState {
  entryId: string;
  doc: EntryDoc;
  /** Applies a change to the draft — the only way the blocks change it. */
  update: (change: (doc: EntryDoc) => EntryDoc) => void;
  readOnly: boolean;
  /** Published once: item or effect is fixed (spec §4.2). */
  kindLocked: boolean;
  /** The live checks, rule text and preview of the draft. */
  analysis: DraftAnalysis;
  /** Every other entry of the library — references, names, pickers. */
  refs: readonly RefOption[];
  /** Tags to offer: the base taxonomy and what the library uses. */
  tags: readonly string[];
  /** Genres to offer a rule of the next game: the games catalog's, lowercase (wave C). */
  genres: readonly string[];
  /** The scenarios' last run, against the scenarios as they are now (spec §5.5). */
  scenarios: {
    /** One per scenario of the draft. */
    verdicts: readonly ScenarioVerdict[];
    running: boolean;
    /** Plays the draft's scenarios as they are in the form; nothing is saved. */
    run: () => void;
  };
}

const EditorContext = createContext<EditorState | null>(null);

export const EditorProvider = EditorContext.Provider;

export function useEditor(): EditorState {
  const state = useContext(EditorContext);
  if (!state) throw new Error("useEditor must be used inside the entry editor");
  return state;
}

/** The errors and warnings whose path lands where `match` says. */
export function issuesWhere(analysis: DraftAnalysis, match: (spot: IssueSpot) => boolean): { errors: Issue[]; warnings: Issue[] } {
  return {
    errors: analysis.errors.filter((i) => match(issueSpot(i.path))),
    warnings: analysis.warnings.filter((i) => match(issueSpot(i.path))),
  };
}

/** The first error on a field of a block — what goes under the input. */
export function fieldError(analysis: DraftAnalysis, block: IssueSpot["block"], field: string): Issue | undefined {
  return analysis.errors.find((i) => {
    const spot = issueSpot(i.path);
    return spot.block === block && (spot.field === field || spot.field?.startsWith(`${field}.`) === true);
  });
}

/**
 * Names for the entries a scenario or a sandbox run mentions, in the reader's
 * language: this entry by its name on the card, any other by the library's.
 */
export function useEntryNames() {
  const { locale } = useI18n();
  const { doc, refs, entryId, analysis } = useEditor();
  const byId = new Map(refs.map((r) => [r.entryId, r]));
  const idOf = (entry: ScenarioEntry) => (entry === "self" ? entryId : entry.entry);
  const nameOf = (id: string): string => {
    if (id === entryId) return analysis.preview.name[locale] || doc.slug;
    const ref = byId.get(id);
    return ref ? (ref.name[locale] ?? ref.name.ru) || ref.slug : "…";
  };
  const kindOf = (id: string): "item" | "effect" | null => (id === entryId ? doc.kind : (byId.get(id)?.kind ?? null));
  return { idOf, nameOf, kindOf };
}
