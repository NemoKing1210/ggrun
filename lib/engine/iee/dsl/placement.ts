/**
 * Where each primitive may appear (spec §6.7) — asked by the checks and by the
 * constructor alike, so the editor never offers what publishing would refuse.
 *
 * Four questions: which triggers an entry of a kind may have rules on, which
 * conditions and actions a rule at a trigger may hold, whether a rule has a
 * chosen player to aim at (or remembers one), and what a number in it may
 * read. Primitives of a stage this build does not carry are offered nowhere.
 */
import type { EntryKind, UsageDoc } from "./doc";
import type { Stage, TriggerName } from "./runtime";
import { VALUE_SOURCES, type ValueSourceName } from "./values";
import {
  ACTIONS,
  CONDITIONS,
  TRIGGERS,
  type ActionOp,
  type ConditionOp,
} from "./vocabulary";

/** Stages this build of the engine carries. */
export const AVAILABLE_STAGES: ReadonlySet<Stage> = new Set<Stage>([1, "A", "B", "C", "D"]);

/** What decides placement besides the trigger: the entry's kind and whom an item aims at. */
export interface RuleScope {
  kind: EntryKind;
  /** An item aimed at a player (`usage.target.who` is `other` or `any`). */
  aimed: boolean;
  /** A reaction item (wave B, spec §6.15): its `onUse` is read at `afterDice`. */
  reaction?: boolean;
  /** An item used while its user's game is in flight (wave C, spec §6.16): its use may act on that game. */
  openRoll?: boolean;
  /** An item whose use asks for a cell (wave D, spec §6.18): it places itself on the board. */
  places?: boolean;
}

/**
 * What decides where an entry's rules may stand (spec §6.10): an instant
 * effect, an item's activation — and whether its use asks for a cell, so it
 * stands on the board (wave D; unknown when absent, as the unscoped lists are).
 */
export interface TriggerShape {
  instant?: boolean;
  activation?: UsageDoc["activation"];
  places?: boolean;
}

/** The shape of an entry's rules, read from its document. */
export function triggerShape(doc: { kind: EntryKind; duration?: { unit: string }; usage?: Partial<Pick<UsageDoc, "activation" | "pick">> }): TriggerShape {
  return doc.kind === "effect" ? { instant: doc.duration?.unit === "instant" } : { activation: doc.usage?.activation ?? "active", places: placesItself(doc) };
}

/** An active item whose use asks for a cell: it places itself on the board (wave D, spec §6.18). */
export function placesItself(doc: { kind: EntryKind; usage?: Partial<Pick<UsageDoc, "activation" | "pick">> }): boolean {
  return doc.kind === "item" && (doc.usage?.activation ?? "active") === "active" && doc.usage?.pick === "cell";
}

/** An item's usage aims at a player. */
export function isAimed(usage: Pick<UsageDoc, "target"> | undefined): boolean {
  const who = usage?.target?.who;
  return who === "other" || who === "any";
}

/** An item used in the reaction window, after the dice (wave B, spec §6.15). */
export function isReactionUsage(doc: { kind: EntryKind; usage?: Partial<Pick<UsageDoc, "activation" | "window">> }): boolean {
  return doc.kind === "item" && (doc.usage?.activation ?? "active") === "active" && doc.usage?.window === "after_dice";
}

/** An item used while its user's game is in flight (wave C, spec §6.16). */
export function isOpenRollUsage(doc: { kind: EntryKind; usage?: Partial<Pick<UsageDoc, "activation" | "window">> }): boolean {
  return doc.kind === "item" && (doc.usage?.activation ?? "active") === "active" && doc.usage?.window === "on_open_roll";
}

/**
 * The scope of an entry's rules. Only an active item is aimed: the others are
 * never used — and a reaction item acts on its holder's own throw.
 */
export function scopeOf(doc: { kind: EntryKind; usage?: Partial<Pick<UsageDoc, "target" | "activation" | "window" | "pick">> }): RuleScope {
  const active = (doc.usage?.activation ?? "active") === "active";
  const reaction = isReactionUsage(doc);
  return {
    kind: doc.kind,
    aimed: doc.kind === "item" && active && !reaction && isAimed(doc.usage),
    reaction,
    openRoll: isOpenRollUsage(doc),
    places: placesItself(doc),
  };
}

/**
 * The moment a rule is read at: a reaction item's `onUse` sees the dice as
 * `afterDice` does (wave B, spec §6.15); every other rule, its own trigger.
 */
export function momentOf(scope: RuleScope | undefined, when: string): string {
  return scope?.reaction === true && when === "onUse" ? "afterDice" : when;
}

/** A rule has a chosen player only at `onUse` of an item aimed at one (§6.7). */
export function hasTargetAt(scope: RuleScope, when: string): boolean {
  return scope.kind === "item" && scope.aimed && when === "onUse";
}

/**
 * An effect's rules at the turn's hooks see the player the item that handed
 * it out was aimed at — where they stand and their last roll — when an item
 * aimed at one handed it to its user (spec §6.11, «Магнит»). Nothing is
 * chosen otherwise, and what reads them does not hold.
 */
export function remembersTargetAt(scope: RuleScope, when: string): boolean {
  return scope.kind === "effect" && Object.hasOwn(TRIGGERS, when) && TRIGGERS[when as TriggerName].hook !== null;
}

/** Whether a condition — or a value source — reading the chosen player may stand here. */
export function seesTargetAt(scope: RuleScope, when: string, remembered: boolean): boolean {
  return hasTargetAt(scope, when) || (remembered && remembersTargetAt(scope, when));
}

/**
 * Triggers an entry of this kind may have rules on, in vocabulary order. An
 * instant effect acts once, as it arrives: its rules run on arrival only. An
 * active item acts when used and as it is picked up; a passive or cursed one
 * is never used — it acts at the turn hooks while held, answers what arrives
 * and holds its standing states (wave B), shapes the pick of its holder's
 * next game (wave C), and acts as it arrives.
 */
export function triggersFor(kind: EntryKind, shape: TriggerShape = {}): TriggerName[] {
  if (kind === "effect" && shape.instant) return ["onApply"];
  const all = (Object.keys(TRIGGERS) as TriggerName[]).filter(
    (t) => AVAILABLE_STAGES.has(TRIGGERS[t].stage) && TRIGGERS[t].kinds.includes(kind),
  );
  if (kind === "effect") return all;
  const held = (shape.activation ?? "active") !== "active";
  // A moment of an object on the board belongs to an item that places itself — offered unless the shape says it does not.
  return all.filter((t) =>
    held ? t !== "onUse" && TRIGGERS[t].placed !== true : TRIGGERS[t].hook === null && TRIGGERS[t].held !== true && (TRIGGERS[t].placed !== true || shape.places !== false),
  );
}

/**
 * Conditions a rule at this trigger may check, in vocabulary order. Given the
 * entry's scope, one that has no form without a chosen player is left out
 * where none can be seen.
 */
export function conditionsAt(when: string, scope?: RuleScope): ConditionOp[] {
  const at = momentOf(scope, when);
  return (Object.keys(CONDITIONS) as ConditionOp[]).filter((op) => {
    const def = CONDITIONS[op];
    if (!AVAILABLE_STAGES.has(def.stage) || !(def.triggers as readonly string[]).includes(at)) return false;
    return !(scope && "aimedOnly" in def && def.aimedOnly && !seesTargetAt(scope, when, "remembered" in def && def.remembered === true));
  });
}

/**
 * The value sources a number in a rule at this trigger may read (spec §6.5):
 * the dice once they are thrown, the items held anywhere, the chosen
 * player's last roll where a chosen player can be seen.
 */
export function sourcesAt(scope: RuleScope, when: string): ValueSourceName[] {
  const at = momentOf(scope, when);
  const def = Object.hasOwn(TRIGGERS, at) ? TRIGGERS[at as TriggerName] : null;
  return VALUE_SOURCES.filter((source) => {
    if (source === "diceSum") return def?.knows.dice === true;
    if (source === "targetLastRoll") return seesTargetAt(scope, when, true);
    return true;
  });
}

/**
 * Actions a rule at this trigger may run, in vocabulary order. Given the
 * entry's scope, an action that has no form without a chosen player is left
 * out where there is none; a reaction item's use runs what acts on the throw,
 * and nothing else (wave B, spec §6.15); what reads a use's pick stands in an
 * effect's rules only, and what acts on the game in flight at the use of an
 * item used on an open roll only (wave C, spec §6.16).
 */
export function actionsAt(when: string, scope?: RuleScope): ActionOp[] {
  const reacting = scope?.reaction === true && when === "onUse";
  return (Object.keys(ACTIONS) as ActionOp[]).filter((op) => {
    const def = ACTIONS[op];
    if (!AVAILABLE_STAGES.has(def.stage)) return false;
    if (reacting) return "reacts" in def && def.reacts === true;
    if ("reactionOnly" in def && def.reactionOnly) return false;
    if (!(def.triggers as readonly string[]).includes(when)) return false;
    // Only an effect remembers what its item's use picked (wave C, spec §6.16).
    if (scope && "readsPick" in def && def.readsPick && scope.kind !== "effect") return false;
    // Only a use on an open roll has a game in flight to act on (spec §6.16).
    if (scope && "openRollOnly" in def && def.openRollOnly && scope.openRoll !== true) return false;
    // Only an item whose use asks for a cell stands on the board (spec §6.18).
    if (scope && "placesOnly" in def && def.placesOnly && scope.places !== true) return false;
    // Only an item changes hands (spec §6.19).
    if (scope && "itemsOnly" in def && def.itemsOnly && scope.kind !== "item") return false;
    return !(scope && "aimedOnly" in def && def.aimedOnly && !hasTargetAt(scope, when));
  });
}

/** Whom an action or a condition may name at this trigger: the holder, and the chosen player where there is one. */
export function recipientsAt(scope: RuleScope, when: string): ("self" | "target")[] {
  return hasTargetAt(scope, when) ? ["self", "target"] : ["self"];
}
