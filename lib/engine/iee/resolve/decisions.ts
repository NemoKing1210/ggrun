/**
 * A player's choices (docs/IEE_CONSTRUCTOR_SPEC.md §6.14, §7.6) — pure: what
 * a question offers, what its default takes and whether an answer fits. The
 * executor loads what the player holds, asks these, and carries the answer out.
 *
 * A question offers the player's bonus items as they stand when it is asked,
 * and an answer is checked against what they hold when they give it: an item
 * gone since is no longer theirs to give, one that came since is.
 */
import type { Rarity } from "../../types/iee";

/** Rarities from the most common up — the order a default gives items up in. */
export const RARITY_ORDER: readonly Rarity[] = ["common", "rare", "epic", "legendary"];

/** One of the player's bonus items, as a question offers it. */
export interface Candidate {
  instanceId: string;
  rarity: Rarity;
  /** When it reached them (ms): the newest goes first on a tie. */
  grantedAt: number;
}

export type DecisionOptionKind = "discard" | "endure" | "retain" | "accept" | "react" | "take";

/**
 * One way to answer (§4.3 `options`): `discard` `count` of the items, `endure`
 * — give nothing and keep what asked, `retain` `count` of them while the rest
 * burn; a reaction window's `accept` and `react` (§7.4); a game choice's
 * `take`, among the games offered (wave C, §7.12).
 */
export interface DecisionOption {
  id: string;
  kind: DecisionOptionKind;
  params: { count?: number; among?: string[] };
}

/** An answer: the option taken and, for one that asks for them, the items picked. */
export interface DecisionChoice {
  option: string;
  picks?: string[];
}

/** How a default is taken (§7.6): the commonest go, the asker is kept, the rarest stay, the throw stands. */
export type DefaultRule = "commonest" | "rarest" | "endure" | "accept";

/** The items in the order a default takes them: the commonest — or the rarest — first, the newest on a tie. */
export function orderedFor(rule: "commonest" | "rarest", candidates: readonly Candidate[]): Candidate[] {
  const rank = (c: Candidate) => RARITY_ORDER.indexOf(c.rarity);
  return [...candidates].sort((a, b) => {
    const byRarity = rule === "commonest" ? rank(a) - rank(b) : rank(b) - rank(a);
    return byRarity !== 0 ? byRarity : b.grantedAt - a.grantedAt;
  });
}

/** What a question's default comes to over what the player holds now. */
export function defaultChoiceOf(rule: DefaultRule, count: number, candidates: readonly Candidate[]): DecisionChoice {
  switch (rule) {
    case "endure":
      return { option: "endure" };
    case "accept":
      return { option: "accept" };
    case "commonest":
      return { option: "discard", picks: orderedFor("commonest", candidates).slice(0, count).map((c) => c.instanceId) };
    case "rarest":
      return { option: "retain", picks: orderedFor("rarest", candidates).slice(0, count).map((c) => c.instanceId) };
  }
}

/** A question the player is asked, with its default as it stands when asked. */
export interface Question {
  options: DecisionOption[];
  defaultChoice: DecisionChoice;
  rule: DefaultRule;
}

/**
 * What `victimChoice` comes to (§6.14): a question when there is a choice —
 * more items than `count`, or with `orKeep` at least `count` — and otherwise
 * the items that go at once: all of them with `count` or fewer, none with
 * `orKeep` and fewer than `count` (what asked stays).
 */
export function victimQuestion(input: {
  count: number;
  orKeep: boolean;
  candidates: readonly Candidate[];
}): { ask: true; question: Question } | { ask: false; discard: string[] } {
  const { count, orKeep, candidates } = input;
  const among = candidates.map((c) => c.instanceId);
  if (orKeep ? candidates.length < count : candidates.length <= count) {
    return { ask: false, discard: orKeep ? [] : among };
  }
  const options: DecisionOption[] = [{ id: "discard", kind: "discard", params: { count, among } }];
  if (orKeep) options.push({ id: "endure", kind: "endure", params: {} });
  const rule: DefaultRule = orKeep ? "endure" : "commonest";
  return { ask: true, question: { options, defaultChoice: defaultChoiceOf(rule, count, candidates), rule } };
}

/** What `holdLimit` asks (§6.14) when the player holds more bonus items than `max`; null when they do not. */
export function holdQuestion(max: number, candidates: readonly Candidate[]): Question | null {
  if (candidates.length <= max) return null;
  const among = candidates.map((c) => c.instanceId);
  return {
    options: [{ id: "retain", kind: "retain", params: { count: max, among } }],
    defaultChoice: defaultChoiceOf("rarest", max, candidates),
    rule: "rarest",
  };
}

export type ChoiceCheck = { ok: true; choice: DecisionChoice } | { ok: false; code: "ieeDecisionChoiceInvalid" };

/**
 * Whether an answer fits the question and what the player holds now: an
 * option it offered, and for `discard` and `retain` as many distinct items as
 * it asks for — or all they still have, when that is fewer — every one of
 * them still theirs. A discard that would leave what asked behind when the
 * player has fewer items than it takes is not an answer: they endure.
 */
export function checkChoice(
  options: readonly DecisionOption[],
  choice: DecisionChoice,
  candidates: readonly Candidate[],
): ChoiceCheck {
  const invalid = { ok: false, code: "ieeDecisionChoiceInvalid" } as const;
  const option = options.find((o) => o.id === choice.option);
  if (!option) return invalid;
  if (option.kind === "endure" || option.kind === "accept") return { ok: true, choice: { option: option.id } };
  const picks = choice.picks ?? [];
  if (new Set(picks).size !== picks.length) return invalid;
  const held = new Set(candidates.map((c) => c.instanceId));
  if (!picks.every((id) => held.has(id))) return invalid;
  const count = option.params.count ?? 1;
  if (option.kind === "react") return picks.length === 1 && (option.params.among ?? []).includes(picks[0]!) ? { ok: true, choice } : invalid;
  // With `endure` beside it, a discard is paid in full or not at all.
  const paysInFull = option.kind === "discard" && options.some((o) => o.kind === "endure");
  const needed = paysInFull ? count : Math.min(count, candidates.length);
  if (paysInFull && candidates.length < count) return invalid;
  return picks.length === needed ? { ok: true, choice: { option: option.id, picks } } : invalid;
}
