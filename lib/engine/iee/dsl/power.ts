/**
 * Power — an entry's strength, in cells (spec §14).
 *
 * Every action has a cost — what one firing is worth on the turns its rule
 * fires on — and a way, helping its holder or setting them back; every
 * condition has a likelihood. A rule is worth its actions times the chance its
 * conditions hold, an effect its rules times how long it lasts, an item its
 * rules times its charges, and the power is what that comes to, whichever way:
 * a drawback takes from the gain. Handing out another entry is worth that
 * entry's power. The costs are calibrated against the simulator
 * (`./play-model`; `lib/modules/iee/sim/power-calibration.test.ts` holds them
 * to it), so a power reads as the advantage an entry gives its holder over its
 * life — or takes from whoever it is aimed at.
 */
import type { IeeParams, Rarity } from "../../types/iee";
import type { EntryDoc, EntryRef, ParamDecl, RuleDoc } from "./doc";
import { isReactionUsage } from "./placement";
import { ANY_PLAY, PLAY_MODEL, arrivalOf, playDice, type DiceShape, type PlayContext } from "./play-model";
import type { EntryFacts } from "./runtime";
import { paramDefaults, valueMean } from "./values";
import {
  isActionOp,
  isConditionOp,
  ACTIONS,
  CONDITIONS,
  TRIGGERS,
  actionDef,
  conditionDef,
  type ActionDoc,
  type ConditionDoc,
  type StaticEnv,
} from "./vocabulary";

/**
 * How many firings a duration unit is worth, per unit. A passed game takes
 * 1/0.6 rolls on average, a little less once the effect's own first roll is
 * counted; the next game is one roll, passed or dropped; permanent is a
 * season's worth.
 */
const DURATION_WEIGHT = { rolls: 1, moves: 1, passed_games: 1.5, triggers: 1, next_game: 1, permanent: 10 } as const;

export interface PowerOptions {
  params?: IeeParams;
  resolve?: (ref: EntryRef) => EntryFacts | null;
  /** The power of another entry — what handing it out is worth; unknown when null. */
  powerOf?: (entryId: string) => number | null;
}

/** A rule with what parses of its conditions and actions — what does not parse is skipped. */
interface ParsedRule {
  when: RuleDoc["when"];
  conditions: ConditionDoc[];
  actions: ActionDoc[];
}

function parseRule(rule: RuleDoc): ParsedRule {
  const conditions: ConditionDoc[] = [];
  for (const raw of rule.if ?? []) {
    if (!isConditionOp(raw.op)) continue;
    const parsed = CONDITIONS[raw.op].schema.safeParse(raw);
    if (parsed.success) conditions.push(parsed.data as ConditionDoc);
  }
  const actions: ActionDoc[] = [];
  for (const raw of rule.do) {
    if (!isActionOp(raw.op)) continue;
    const parsed = ACTIONS[raw.op].schema.safeParse(raw);
    if (parsed.success) actions.push(parsed.data as ActionDoc);
  }
  return { when: rule.when, conditions, actions };
}

/** What a rule's conditions say about the turns it fires on, from where the entry starts it. */
function playOf(conditions: readonly ConditionDoc[], env: StaticEnv, start: PlayContext): PlayContext {
  let play = start;
  for (const c of conditions) play = conditionDef(c).narrow?.(c, env, play) ?? play;
  return play;
}

/**
 * The dice a pass and a drop throw once the entry's own rules have added to
 * them before the throw — «Кости судьбы»'s die more on a pass, which its "a
 * sum of 4 or less" then reads. Only a rule that fires on every pass (or drop)
 * counts; null when none adds anything.
 */
function ownDice(rules: readonly ParsedRule[], env: StaticEnv): { pass: DiceShape; drop: DiceShape } | null {
  const dice = playDice(ANY_PLAY);
  const pass = { ...dice.pass };
  const drop = { ...dice.drop };
  let changed = false;
  for (const rule of rules) {
    if (rule.when !== "beforeMovement" || !rule.conditions.every((c) => c.op === "outcome")) continue;
    const outcome = rule.conditions.find((c) => c.op === "outcome")?.is ?? null;
    for (const action of rule.actions) {
      if (action.op !== "dice") continue;
      const count = action.count === undefined ? 0 : Math.round(valueMean(action.count, env.params, env.decls));
      const sides = action.sides === undefined ? 0 : Math.round(valueMean(action.sides, env.params, env.decls));
      for (const [shape, applies] of [
        [pass, outcome !== "dropped"],
        [drop, outcome !== "passed"],
      ] as const) {
        if (!applies) continue;
        shape.count += count;
        shape.sides += sides;
      }
      changed ||= count !== 0 || sides !== 0;
    }
  }
  return changed ? { pass, drop } : null;
}

/** Whether the dice are thrown by the time a rule at this trigger runs. */
const knowsDice = (when: string) => Object.hasOwn(TRIGGERS, when) && TRIGGERS[when as keyof typeof TRIGGERS].knows.dice;

export function entryPower(doc: EntryDoc, options: PowerOptions = {}): number {
  const decls: Readonly<Record<string, ParamDecl>> = doc.params ?? {};
  const env: StaticEnv = {
    params: { ...paramDefaults(decls), ...(options.params ?? {}) },
    decls,
    resolve: options.resolve ?? (() => null),
    powerOf: options.powerOf,
  };
  // An effect that lasts a number of triggers waits for its conditions to
  // hold: it fires that many times whenever that is. So does a passive or
  // cursed item with charges — it spends one on each turn a rule fires (§6.10).
  const heldWithCharges = doc.kind === "item" && doc.usage?.activation !== "active" && doc.usage?.charges != null;
  const waits = (doc.kind === "effect" && doc.duration?.unit === "triggers") || heldWithCharges;

  const rules = doc.rules.map(parseRule);
  // The entry's own dice, where its later rules read the throw.
  const dice = ownDice(rules, env);

  /** What fires on every turn the entry lasts, or on every use of an item. */
  let perUse = 0;
  /** What an effect does as it arrives and as it ends: once, however long it lasts. */
  let once = 0;
  /** What a board object does to the mover who enters it (wave D, §6.18), signed for the mover. */
  let onMover = 0;
  // A reaction item's use is read after the dice, and worth what it gains where it is used (wave B, §6.15).
  const reaction = isReactionUsage(doc);
  for (const rule of rules) {
    const reacts = reaction && rule.when === "onUse";
    const moment = reacts ? "afterDice" : rule.when;
    // Arrival and end (and an item's pickup) happen once, however long it lasts.
    const lifecycle =
      (doc.kind === "effect" && (rule.when === "onApply" || rule.when === "onExpire")) ||
      (doc.kind === "item" && rule.when === "onPickup");
    const thrown = dice && knowsDice(moment) ? { ...ANY_PLAY, dice } : ANY_PLAY;
    // One that waits fires on what it waits for: a firing is one answer's worth (§6.17).
    const start = reacts ? { ...thrown, reaction: true } : waits && !lifecycle ? { ...thrown, waits: true } : thrown;
    const play = playOf(rule.conditions, env, start);
    // A rule at `onIncoming` answers as often as what it answers arrives: an
    // `incoming` condition says what and how often; without one, everything (§6.13).
    const answersAll = rule.when === "onIncoming" && !rule.conditions.some((c) => c.op === "incoming");
    const base = answersAll ? arrivalOf(null).perRoll : 1;
    // A reaction waits for a throw its conditions let through: they say where it is used, not how often (§6.15).
    const likelihood = (waits && !lifecycle) || reacts ? 1 : rule.conditions.reduce((acc, c) => acc * conditionDef(c).likelihood(c, env, play), base);
    let cost = 0;
    for (const action of rule.actions) {
      const def = actionDef(action);
      cost += (def.sign?.(action, env, play) ?? 1) * def.cost(action, env, play);
    }
    if (rule.when === "onObjectEntered") onMover += cost * likelihood;
    // A rival arrives on the holder's cell in so many of their rolls (`PLAY_MODEL.sameCell`, §6.19).
    else if (rule.when === "onSameCell") perUse += cost * likelihood * PLAY_MODEL.sameCell;
    else if (lifecycle) once += cost * likelihood;
    else perUse += cost * likelihood;
  }
  // An object serves its owner: placed where it meets the one it was placed for
  // — a rival for a harm, the owner for a gain — it is worth what it does to the
  // mover, less what it does when it meets the other (`PLAY_MODEL.object`).
  perUse += Math.abs(onMover) * (2 * PLAY_MODEL.object.aimed - 1);

  let multiplier = 1;
  // An item's uses, or its firings; a passive one without charges works for good.
  if (doc.kind === "item") {
    multiplier = doc.usage?.charges ?? (doc.usage?.activation === "passive" ? DURATION_WEIGHT.permanent : 1);
    // One a rival may take stays as long as nobody arrives on its holder's cell (§6.19).
    const taken = doc.rules.some((r) => r.when === "onSameCell" && r.do.some((a) => a.op === "takeEntry"));
    if (taken) multiplier = Math.min(multiplier, 1 / PLAY_MODEL.sameCell);
  }
  else if (doc.duration) {
    const unit = doc.duration.unit;
    if (unit === "permanent") multiplier = DURATION_WEIGHT.permanent;
    else if (unit in DURATION_WEIGHT) {
      multiplier = DURATION_WEIGHT[unit as keyof typeof DURATION_WEIGHT] * (doc.duration.count ?? 1);
    }
  }
  // What the actions come to together, whichever way: a drawback takes from the gain.
  return Math.round(Math.abs(perUse * multiplier + once) * 10) / 10;
}

/**
 * The power of each of a set of documents, a grant costing what it hands out.
 * A reference outside the set — or one that leads back to where it started —
 * costs what an unknown grant does.
 */
export function powerTable(
  docs: ReadonlyMap<string, EntryDoc>,
  resolve: (ref: EntryRef) => EntryFacts | null = () => null,
): Map<string, number> {
  const done = new Map<string, number>();
  const visiting = new Set<string>();
  const powerOf = (entryId: string): number | null => {
    const known = done.get(entryId);
    if (known !== undefined) return known;
    const doc = docs.get(entryId);
    if (!doc || visiting.has(entryId)) return null;
    visiting.add(entryId);
    const power = entryPower(doc, { resolve, powerOf });
    visiting.delete(entryId);
    done.set(entryId, power);
    return power;
  };
  for (const id of docs.keys()) powerOf(id);
  return done;
}

/**
 * The most power each rarity carries (spec §14): a common entry is worth up to
 * one good move modifier, a rare one a strong one, an epic one a turn's worth
 * of moves; anything stronger is legendary. Every `core` entry sits at or
 * below its own rarity.
 */
export const RARITY_POWER: Readonly<Record<Exclude<Rarity, "legendary">, number>> = { common: 2.5, rare: 4, epic: 6 };

const RARITY_ORDER: readonly Rarity[] = ["common", "rare", "epic", "legendary"];

/** The rarity a power suggests. */
export function suggestedRarity(power: number): Rarity {
  if (power <= RARITY_POWER.common) return "common";
  if (power <= RARITY_POWER.rare) return "rare";
  if (power <= RARITY_POWER.epic) return "epic";
  return "legendary";
}

/** Whether a power is more than a rarity carries. */
export function aboveRarity(power: number, rarity: Rarity): boolean {
  return RARITY_ORDER.indexOf(suggestedRarity(power)) > RARITY_ORDER.indexOf(rarity);
}
