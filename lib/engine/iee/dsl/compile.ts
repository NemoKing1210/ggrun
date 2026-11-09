/**
 * Document → runtime entry (spec §8).
 *
 * Compilation only selects vocabulary functions and binds their parameters:
 * there is no `eval`, no generated source, nothing in a document that runs.
 * The input is assumed to have passed `checkEntry` — compiling an unchecked
 * document is a programming error and throws.
 */
import { pickKindOf, type HookName, type HookPatch, type IeeIntent } from "../../types/iee";
import {
  RULE_PRIORITY,
  fillLocales,
  type EntryDoc,
  type EntryRef,
  type ParamDecl,
  type RuleDoc,
} from "./doc";
import type { ReactionRules } from "../../turn/reaction";
import { IEE_GLYPHS } from "./glyphs";
import {
  emptyRuleOutput,
  type CompiledEffect,
  type CompiledEntry,
  type CompiledEventRule,
  type CompiledHookRule,
  type CompiledIncomingRule,
  type CompiledItem,
  type CompiledObjectRule,
  type CompiledSameCellRule,
  type CompiledPoolRule,
  type CompiledRollRule,
  type CompiledStandingRule,
  type EntryFacts,
  type ItemUseInput,
  type ItemUseOutcome,
  type ReactInput,
  type RuleContext,
  type RuleOutput,
  type TriggerName,
} from "./runtime";
import { ruleText } from "./text";
import { paramDefaults } from "./values";
import {
  ACTIONS,
  CONDITIONS,
  TRIGGERS,
  actionDef,
  conditionDef,
  isActionOp,
  isConditionOp,
  isTriggerName,
  type ActionDoc,
  type ConditionDoc,
  type RunEnv,
} from "./vocabulary";

export interface CompileInput {
  entryId: string;
  revisionId: string;
  doc: EntryDoc;
  /** The season's view of other entries — references resolve through it (D11). */
  resolve: (entryId: string) => EntryFacts | null;
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

interface BoundRule {
  index: number;
  trigger: TriggerName;
  priority: number;
  conditions: ConditionDoc[];
  actions: ActionDoc[];
  needsTarget: boolean;
}

function bindRule(rule: RuleDoc, index: number): BoundRule {
  if (!isTriggerName(rule.when)) throw new CompileError(`rule ${index}: unknown trigger ${rule.when}`);
  const conditions = (rule.if ?? []).map((raw, i) => {
    if (!isConditionOp(raw.op)) throw new CompileError(`rule ${index}: unknown condition ${raw.op} at ${i}`);
    return CONDITIONS[raw.op].schema.parse(raw) as ConditionDoc;
  });
  const actions = rule.do.map((raw, i) => {
    if (!isActionOp(raw.op)) throw new CompileError(`rule ${index}: unknown action ${raw.op} at ${i}`);
    return ACTIONS[raw.op].schema.parse(raw) as ActionDoc;
  });
  return {
    index,
    trigger: rule.when,
    priority: RULE_PRIORITY[rule.priority ?? "normal"],
    conditions,
    actions,
    needsTarget:
      conditions.some((c) => conditionDef(c).needsTarget(c)) || actions.some((a) => actionDef(a).needsTarget(a)),
  };
}

/**
 * Conditions in order, stopping at the first false one; then the actions.
 * What an action does to the chosen player that harms them (D9) is marked so
 * protection can answer it (wave B, spec §6.13): `harmTo` on its intents.
 */
function runBound(rule: BoundRule, ctx: RuleContext, env: RunEnv): RuleOutput | null {
  for (const condition of rule.conditions) {
    if (!conditionDef(condition).evaluate(condition, ctx, env)) return null;
  }
  const out = emptyRuleOutput();
  const harmed = ctx.target && ctx.target.seasonPlayerId !== ctx.self.seasonPlayerId ? ctx.target.seasonPlayerId : null;
  for (const action of rule.actions) {
    const def = actionDef(action);
    const before = out.intents.length;
    def.apply(action, ctx, env, out);
    if (harmed === null || out.intents.length === before) continue;
    if (def.harm(action, { params: env.params, decls: env.decls, resolve: env.resolve }) !== "target") continue;
    for (let i = before; i < out.intents.length; i++) out.intents[i] = { ...out.intents[i]!, harmTo: harmed };
  }
  return out;
}

/** A rule at `onIncoming` (wave B, spec §6.13): its answer, when its conditions hold. */
function incomingRule(rule: BoundRule, runEnv: (params: RunEnv["params"]) => RunEnv): CompiledIncomingRule {
  return { ruleIndex: rule.index, run: (ctx) => runBound(rule, ctx, runEnv(ctx.params))?.answer ?? null };
}

/** A rule at `whileActive` (wave B, spec §6.13): what holds, when its conditions do. */
function standingRule(rule: BoundRule, runEnv: (params: RunEnv["params"]) => RunEnv): CompiledStandingRule {
  return {
    ruleIndex: rule.index,
    run: (ctx) => {
      const out = runBound(rule, ctx, runEnv(ctx.params));
      return out
        ? {
            untargetable: out.untargetable,
            forbidItems: out.forbidItems,
            pierce: out.pierce,
            holdLimit: out.holdLimit,
            conditionImmunity: out.conditionImmunity,
          }
        : null;
    },
  };
}

/** A rule at `beforeGameRoll` (wave C, spec §6.16): what it does to the holder's next game, when its conditions hold. */
function poolRule(rule: BoundRule, runEnv: (params: RunEnv["params"]) => RunEnv): CompiledPoolRule {
  return { ruleIndex: rule.index, run: (ctx) => runBound(rule, ctx, runEnv(ctx.params))?.pool ?? null };
}

/** A rule at `onRollCreated` (wave C, spec §6.17): the conditions it gives the game, when its conditions hold. */
function rollRule(rule: BoundRule, runEnv: (params: RunEnv["params"]) => RunEnv): CompiledRollRule {
  return { ruleIndex: rule.index, run: (ctx) => runBound(rule, ctx, runEnv(ctx.params))?.conditions ?? null };
}

/** A rule at `onSameCell` (wave D, spec §6.19): what it asks when a rival arrives on the holder's cell, and whether they take the item. */
function sameCellRule(rule: BoundRule, runEnv: (params: RunEnv["params"]) => RunEnv): CompiledSameCellRule {
  return {
    ruleIndex: rule.index,
    run: (ctx) => {
      const out = runBound(rule, ctx, runEnv(ctx.params));
      return out ? { intents: out.intents, take: out.take } : null;
    },
  };
}

/** A rule at `onObjectEntered` (wave D, spec §6.18): what the object does to the mover, when its conditions hold. */
function objectRule(rule: BoundRule, runEnv: (params: RunEnv["params"]) => RunEnv): CompiledObjectRule {
  return { ruleIndex: rule.index, run: (ctx) => runBound(rule, ctx, runEnv(ctx.params))?.object ?? null };
}

/** The turn-hook shape of a rule's output: only what it actually set. */
function toPatch(out: RuleOutput, reason: string, consumeCharge: boolean): HookPatch {
  const patch: HookPatch = { reason };
  if (out.stepsDelta !== 0) patch.stepsDelta = out.stepsDelta;
  if (out.diceCountDelta !== 0) patch.diceCountDelta = out.diceCountDelta;
  if (out.diceSidesDelta !== 0) patch.diceSidesDelta = out.diceSidesDelta;
  if (out.balanceDelta !== 0) patch.balanceDelta = out.balanceDelta;
  if (out.rerollValues.length > 0) patch.rerollValues = [...out.rerollValues];
  if (out.bestOfTwo) patch.bestOfTwo = true;
  if (out.worstOfTwo) patch.worstOfTwo = true;
  if (out.resultDelta !== 0) patch.resultDelta = out.resultDelta;
  if (out.resultCap !== null) patch.resultCap = out.resultCap;
  if (out.reverseLowerHalf) patch.reverseLowerHalf = true;
  if (out.skipCellEffect) patch.skipCellEffect = true;
  if (out.cancelMove) patch.cancelMove = true;
  if (out.intents.length > 0) patch.intents = out.intents;
  if (out.extraSpins.length > 0) patch.extraSpins = [...out.extraSpins];
  if (consumeCharge) patch.consumeCharge = true;
  return patch;
}

/**
 * The rules of a passive or cursed item that act while it is held (spec
 * §6.10) — its turn hooks, as an effect's are — and the rules every item runs
 * as it is picked up. An active item has no hooks: it acts when used.
 */
function compileHeld(
  slug: string,
  rules: readonly BoundRule[],
  activation: "active" | "passive" | "cursed",
  reason: string,
  consumesCharge: boolean,
  runEnv: (params: RunEnv["params"]) => RunEnv,
): {
  hooks: Partial<Record<HookName, CompiledHookRule[]>>;
  onPickup: CompiledEventRule[];
  incoming: CompiledIncomingRule[];
  standing: CompiledStandingRule[];
  pool: CompiledPoolRule[];
  rollCreated: CompiledRollRule[];
  sameCell: CompiledSameCellRule[];
} {
  const hooks: Partial<Record<HookName, CompiledHookRule[]>> = {};
  const onPickup: CompiledEventRule[] = [];
  const incoming: CompiledIncomingRule[] = [];
  const standing: CompiledStandingRule[] = [];
  const pool: CompiledPoolRule[] = [];
  const rollCreated: CompiledRollRule[] = [];
  const sameCell: CompiledSameCellRule[] = [];
  for (const rule of rules) {
    // An active item's use, and what it does once it stands on the board (wave D), are compiled with the item.
    if (rule.trigger === "onUse" || (rule.trigger === "onObjectEntered" && activation === "active")) continue;
    if (rule.trigger === "onPickup") {
      onPickup.push({ ruleIndex: rule.index, run: (ctx) => runBound(rule, ctx, runEnv(ctx.params))?.intents ?? null });
      continue;
    }
    // What arrives, what holds (wave B) and the next game (wave C) are an item's while it is held, as its turn hooks are.
    const held = TRIGGERS[rule.trigger].held === true;
    const hook = TRIGGERS[rule.trigger].hook;
    if ((!hook && !held) || activation === "active") throw new CompileError(`${slug}: ${rule.trigger} is not a trigger for a ${activation} item`);
    if (rule.trigger === "onIncoming") incoming.push(incomingRule(rule, runEnv));
    else if (rule.trigger === "whileActive") standing.push(standingRule(rule, runEnv));
    else if (rule.trigger === "beforeGameRoll") pool.push(poolRule(rule, runEnv));
    else if (rule.trigger === "onRollCreated") rollCreated.push(rollRule(rule, runEnv));
    else if (rule.trigger === "onSameCell") sameCell.push(sameCellRule(rule, runEnv));
    else (hooks[hook!] ??= []).push(hookRule(rule, reason, consumesCharge, runEnv));
  }
  return { hooks, onPickup, incoming, standing, pool, rollCreated, sameCell };
}

/** One rule bound to the turn hook its trigger maps to. */
function hookRule(
  rule: BoundRule,
  reason: string,
  consumesCharge: boolean,
  runEnv: (params: RunEnv["params"]) => RunEnv,
): CompiledHookRule {
  return {
    ruleIndex: rule.index,
    priority: rule.priority,
    run: (ctx) => {
      const out = runBound(rule, ctx, runEnv(ctx.params));
      return out ? toPatch(out, reason, consumesCharge) : null;
    },
  };
}

/**
 * A reaction item's `onUse` rules on the throw in the window (wave B, spec
 * §6.15): what those whose conditions hold ask of the dice, together; null
 * when none holds.
 */
function reactTo(rules: readonly BoundRule[], input: ReactInput, env: RunEnv): ReactionRules | null {
  let fired = false;
  const out: ReactionRules = { reroll: false, bestOfTwo: false, rerollValues: [], resultDelta: 0, resultCap: null };
  for (const rule of rules) {
    const o = runBound(
      rule,
      {
        trigger: "onUse",
        params: input.params,
        self: input.actor,
        target: null,
        turn: input.turn,
        selfEntries: input.actorEntries,
        targetEntries: [],
        rng: input.rng,
        instanceId: input.instanceId ?? null,
      },
      env,
    );
    if (!o) continue;
    fired = true;
    out.reroll ||= o.rerollAll;
    out.bestOfTwo ||= o.bestOfTwo;
    for (const v of o.rerollValues) if (!out.rerollValues.includes(v)) out.rerollValues.push(v);
    out.resultDelta += o.resultDelta;
    if (o.resultCap !== null) out.resultCap = out.resultCap === null ? o.resultCap : Math.min(out.resultCap, o.resultCap);
  }
  return fired ? out : null;
}

export function compileEntry(input: CompileInput): CompiledEntry {
  const { doc } = input;
  const decls: Readonly<Record<string, ParamDecl>> = doc.params ?? {};
  const defaults = paramDefaults(decls);
  const resolveRef = (ref: EntryRef) => input.resolve(ref.entry);
  const rules = doc.rules.map(bindRule);

  const runEnv = (params: RunEnv["params"]): RunEnv => ({
    params,
    decls,
    resolve: resolveRef,
    entry: { slug: doc.slug, kind: doc.kind },
  });

  const base = {
    entryId: input.entryId,
    revisionId: input.revisionId,
    key: doc.slug,
    slug: doc.slug,
    name: doc.name,
    names: fillLocales(doc.name),
    flavor: doc.flavor ? fillLocales(doc.flavor) : null,
    ruleText: ruleText(doc, { params: defaults, resolve: input.resolve }),
    character: doc.character,
    polarity: doc.character === "bonus" ? ("positive" as const) : ("negative" as const),
    rarity: doc.rarity,
    tags: doc.tags,
    glyph: doc.glyph !== undefined && IEE_GLYPHS.includes(doc.glyph) ? doc.glyph : null,
    params: decls,
    defaults,
    protectionTier: doc.protection?.tier ?? (1 as const),
    doc,
  };

  if (doc.kind === "item") {
    const usage = doc.usage;
    if (!usage) throw new CompileError(`${doc.slug}: an item needs usage`);
    const activation = usage.activation;
    if (activation !== "passive" && usage.charges === undefined) {
      throw new CompileError(`${doc.slug}: a ${activation} item needs charges`);
    }
    const window = activation === "active" ? (usage.window ?? "anytime") : "anytime";
    // A reaction item is used in the reaction window, on its holder's own throw (wave B, §6.15).
    const reaction = window === "after_dice";
    // Only an active item is used, so only it has someone to aim at (spec §6.10).
    const target = activation === "active" ? (reaction ? "self" : (usage.target?.who ?? "self")) : "none";
    const onUse = rules.filter((r) => r.trigger === "onUse");
    if (activation !== "active" && onUse.length > 0) throw new CompileError(`${doc.slug}: a ${activation} item is never used`);
    const reachesTarget = target === "other" || onUse.some((r) => r.needsTarget);
    // A cursed item, and a passive one with charges, spends one each turn a rule of it fires.
    const held = compileHeld(doc.slug, rules, activation, `item:${doc.slug}`, usage.charges !== undefined, runEnv);
    const choiceAction = onUse
      .flatMap((r) => r.actions)
      .find((a): a is Extract<ActionDoc, { op: "remove" }> => a.op === "remove" && a.pick === "choice");
    // An entry of the season's catalog the user picks as they use it (wave B, spec §6.12).
    const chosenAction = onUse
      .flatMap((r) => r.actions)
      .find((a): a is Extract<ActionDoc, { op: "grantChosen" }> => a.op === "grantChosen");

    const item: CompiledItem = {
      ...base,
      kind: "item",
      usage: {
        activation,
        window,
        target,
        charges: usage.charges ?? null,
        // Cursed items are always unique, whatever the document says (spec §6.10); one in the season is one per holder too.
        unique: activation === "cursed" || usage.unique === true || usage.unique === "season",
        seasonUnique: usage.unique === "season",
        filter: activation === "active" ? (usage.target?.filter ?? null) : null,
        choice: choiceAction
          ? {
              what: choiceAction.what,
              character: choiceAction.character ?? null,
              entryId: choiceAction.entry ? (input.resolve(choiceAction.entry.entry)?.entryId ?? choiceAction.entry.entry) : null,
              rarity: choiceAction.rarity ?? null,
            }
          : null,
        entryChoice: chosenAction ? { rarity: chosenAction.rarity ?? null, activation: chosenAction.activation ?? null } : null,
        // Only an active item is used, so only it asks for a pick (wave C, spec §6.16).
        pick: activation === "active" ? (usage.pick ?? null) : null,
      },
      hooks: held.hooks,
      onPickup: held.onPickup,
      incoming: held.incoming,
      standing: held.standing,
      pool: held.pool,
      rollCreated: held.rollCreated,
      sameCell: held.sameCell,
      // What it does once it stands on the board (wave D, spec §6.18).
      objectEntered: activation === "active" ? rules.filter((r) => r.trigger === "onObjectEntered").map((r) => objectRule(r, runEnv)) : [],
      ...(reaction ? { react: (input: ReactInput) => reactTo(onUse, input, runEnv(input.params)) } : {}),
      use(use: ItemUseInput): ItemUseOutcome {
        const feedPayload: Record<string, unknown> = { itemKey: doc.slug };
        const reject = (code: string): ItemUseOutcome => ({ intents: [], rejected: code, feedPayload });
        // Passive and cursed items work by themselves; nobody uses them.
        if (activation !== "active") return reject("ieeItemNotUsable");
        // The same refusals the hand-written catalog made, now derived from the
        // document: who the item is aimed at decides which apply.
        if (reachesTarget && !use.target) return reject("ieeTargetRequired");
        if (target === "other" && use.target && use.target.seasonPlayerId === use.actor.seasonPlayerId) {
          return reject("ieeTargetSelfNotAllowed");
        }
        if (
          reachesTarget &&
          use.target &&
          use.target.seasonPlayerId !== use.actor.seasonPlayerId &&
          use.target.status !== "active"
        ) {
          return reject("ieeTargetNotActive");
        }
        // An item that asks for a pick is not used without one of its kind (wave C, spec §6.16).
        const pick = usage.pick && activation === "active" ? (use.pick ?? null) : null;
        if (usage.pick && activation === "active" && (!pick || pickKindOf(pick) !== usage.pick)) return reject("ieePickRequired");

        const intents: IeeIntent[] = [];
        const env = runEnv(use.params);
        for (const rule of onUse) {
          const out = runBound(
            rule,
            {
              trigger: "onUse",
              params: use.params,
              self: use.actor,
              target: use.target,
              turn: null,
              selfEntries: use.actorEntries,
              targetEntries: use.targetEntries,
              rng: use.rng,
              choice: use.choice ?? null,
              entryChoice: use.entryChoice ?? null,
              instanceId: use.instanceId ?? null,
              pick,
            },
            env,
          );
          if (out) intents.push(...out.intents);
        }
        const aimed = intents.find(
          (i) => i.kind === "grant" && i.entryKind === "effect" && i.to !== use.actor.seasonPlayerId,
        );
        if (aimed && aimed.kind === "grant") feedPayload.effectKey = aimed.key;
        return { intents, feedPayload };
      },
    };
    return item;
  }

  const duration = doc.duration;
  if (!duration) {
    throw new CompileError(`${doc.slug}: an effect needs a duration`);
  }
  // An instant effect acts once, as it arrives, and keeps nothing (spec §6.4).
  if (duration.unit === "instant" && rules.some((r) => r.trigger !== "onApply")) {
    throw new CompileError(`${doc.slug}: an instant effect has onApply rules only`);
  }
  const consumesCharge = duration.unit === "triggers";
  const reason = `effect:${doc.slug}`;

  const hooks: Partial<Record<HookName, CompiledHookRule[]>> = {};
  const onApply: CompiledEventRule[] = [];
  const onExpire: CompiledEventRule[] = [];
  const incoming: CompiledIncomingRule[] = [];
  const standing: CompiledStandingRule[] = [];
  const pool: CompiledPoolRule[] = [];
  const rollCreated: CompiledRollRule[] = [];
  const sameCell: CompiledSameCellRule[] = [];
  for (const rule of rules) {
    const hook = TRIGGERS[rule.trigger].hook;
    if (hook) {
      (hooks[hook] ??= []).push(hookRule(rule, reason, consumesCharge, runEnv));
    } else if (rule.trigger === "onIncoming") {
      incoming.push(incomingRule(rule, runEnv));
    } else if (rule.trigger === "whileActive") {
      standing.push(standingRule(rule, runEnv));
    } else if (rule.trigger === "beforeGameRoll") {
      pool.push(poolRule(rule, runEnv));
    } else if (rule.trigger === "onRollCreated") {
      rollCreated.push(rollRule(rule, runEnv));
    } else if (rule.trigger === "onSameCell") {
      sameCell.push(sameCellRule(rule, runEnv));
    } else if (rule.trigger === "onApply" || rule.trigger === "onExpire") {
      const compiled: CompiledEventRule = {
        ruleIndex: rule.index,
        run: (ctx) => runBound(rule, ctx, runEnv(ctx.params))?.intents ?? null,
      };
      (rule.trigger === "onApply" ? onApply : onExpire).push(compiled);
    } else {
      throw new CompileError(`${doc.slug}: ${rule.trigger} is not a trigger for an effect`);
    }
  }

  // An effect that moves the nearest rival behind its holder as it arrives has
  // nothing to do for a holder with nobody behind — the wheel does not offer it.
  const needsBehind = rules.some(
    (rule) =>
      rule.trigger === "onApply" &&
      rule.actions.some((a) => a.op === "halveGap" || (a.op === "swapPositions" && a.with === "nearestBehind")),
  );
  const effect: CompiledEffect = {
    ...base,
    kind: "effect",
    needsBehind,
    // `next_game` is one game, passed or dropped: counted like a single roll (spec §7.9).
    duration: { unit: duration.unit, count: duration.unit === "next_game" ? 1 : (duration.count ?? null) },
    stacking: {
      mode: doc.stacking?.mode ?? "refresh",
      maxStacks: doc.stacking?.maxStacks ?? null,
    },
    hooks,
    onApply,
    onExpire,
    incoming,
    standing,
    pool,
    rollCreated,
    sameCell,
  };
  return effect;
}
