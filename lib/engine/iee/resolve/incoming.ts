/**
 * What arrives at a player, and how their instances answer it
 * (docs/IEE_CONSTRUCTOR_SPEC.md §6.13, §7.8) — pure: the executor and the use
 * checks load the instances, ask these, and carry the answer out.
 *
 * Two kinds of rule are asked. A rule at `whileActive` says what holds while
 * its instance lasts — the holder cannot be aimed at, cannot use items, or
 * lets harmful actions pierce their protection. A rule at `onIncoming` answers
 * one arrival — blocks it, turns it back, makes it stronger or replaces it.
 */
import type { IeeParams, IeePlayerSnapshot } from "../../types/iee";
import type { ArrivalView, CompiledEntry, EntryFacts, IncomingAnswer, StandingAnswer } from "../dsl";

/** An instance whose rules may answer: an effect, or a passive or cursed item — never an active one. */
export interface AnsweringSource {
  instanceId: string;
  entry: CompiledEntry;
  params: IeeParams;
}

/** What the rules see of the holder. */
export interface AnswerBase {
  self: IeePlayerSnapshot;
  selfEntries: readonly EntryFacts[];
  rng: () => number;
}

/** What holds now, and which instance's rule set the hold limit — the one that asks when it is passed. */
export interface Standing extends StandingAnswer {
  /** The instance whose `holdLimit` is the strictest; null when there is none. */
  holdLimitBy: string | null;
}

/**
 * What the holder's standing rules say holds now: every one whose conditions
 * hold counts — a pierce adds up, the strictest hold limit stands (the oldest
 * on a tie).
 */
export function standingOf(sources: readonly AnsweringSource[], base: AnswerBase): Standing {
  const out: Standing = { untargetable: false, forbidItems: false, pierce: 0, holdLimit: null, holdLimitBy: null, conditionImmunity: false };
  for (const source of sources) {
    for (const rule of source.entry.standing) {
      const answer = rule.run({
        trigger: "whileActive",
        params: source.params,
        self: base.self,
        target: null,
        turn: null,
        selfEntries: base.selfEntries,
        targetEntries: [],
        rng: base.rng,
        instanceId: source.instanceId,
      });
      if (!answer) continue;
      out.untargetable ||= answer.untargetable;
      out.forbidItems ||= answer.forbidItems;
      out.conditionImmunity ||= answer.conditionImmunity;
      out.pierce += answer.pierce;
      if (answer.holdLimit !== null && (out.holdLimit === null || answer.holdLimit < out.holdLimit)) {
        out.holdLimit = answer.holdLimit;
        out.holdLimitBy = source.instanceId;
      }
    }
  }
  return out;
}

/** How the arrival stands, beyond what it is: what decides whether an answer applies. */
export interface ArrivalTerms {
  /** The pierce of a harmful action: the holder's standing `pierce`, added up; 0 for anything else. */
  pierce: number;
  /** It was turned back already: it is never turned back again. */
  reflected: boolean;
  /** Whether it can come stronger — an item handed over or a swap cannot. */
  amplifiable: boolean;
}

export interface FoundAnswer {
  source: AnsweringSource;
  ruleIndex: number;
  answer: IncomingAnswer;
  /** The draws its conditions made, journaled with it. */
  draws: number[];
}

/**
 * Whether an answer applies to what arrives: a block or a reflection stops a
 * harmful action only when the entry's tier is above its pierce, and a
 * reflection needs a rival's action not reflected yet; an amplification needs
 * something that can come stronger.
 */
export function answerApplies(answer: IncomingAnswer, entry: CompiledEntry, arrival: ArrivalView, terms: ArrivalTerms): boolean {
  switch (answer.kind) {
    case "reflect":
      if (arrival.is !== "harm" || terms.reflected) return false;
      return entry.protectionTier > terms.pierce;
    case "block":
      return arrival.is !== "harm" || entry.protectionTier > terms.pierce;
    case "amplify":
      return terms.amplifiable;
    case "replace":
      return true;
  }
}

/**
 * The answer to an arrival: the holder's instances asked oldest first, each
 * rule in order, and the first one whose conditions hold and whose answer
 * applies answers. Null when nothing does.
 */
export function answerOf(
  sources: readonly AnsweringSource[],
  arrival: ArrivalView,
  base: AnswerBase,
  terms: ArrivalTerms,
): FoundAnswer | null {
  for (const source of sources) {
    for (const rule of source.entry.incoming) {
      const draws: number[] = [];
      const rng = () => {
        const value = base.rng();
        draws.push(value);
        return value;
      };
      const answer = rule.run({
        trigger: "onIncoming",
        params: source.params,
        self: base.self,
        target: null,
        turn: null,
        selfEntries: base.selfEntries,
        targetEntries: [],
        rng,
        instanceId: source.instanceId,
        arrival,
      });
      if (!answer || !answerApplies(answer, source.entry, arrival, terms)) continue;
      return { source, ruleIndex: rule.ruleIndex, answer, draws };
    }
  }
  return null;
}
