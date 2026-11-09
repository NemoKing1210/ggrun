/**
 * Vocabulary v1 — the closed set of primitives an entry may be written with
 * (spec §6). This build carries the stage-1 rows; the waves add theirs here.
 *
 * Every primitive is one object holding everything about it: the Zod schema of
 * its parameters, the pure function that runs it, where it may appear, the harm
 * it does, its power cost and its sentence in each language. Adding a mechanic
 * means adding one of these, with tests — never evaluating anything a document
 * says.
 */
import { z } from "zod";

import type { GameMatch, HookName, IeeParams, Rarity } from "../../types/iee";
import {
  CELL_TYPES,
  CHARACTERS,
  ENTRY_KINDS,
  EntryRefSchema,
  GenreSchema,
  LIMITS,
  LocalizedSchema,
  PARAM_NAME_RE,
  RARITIES,
  TAG_RE,
  YEAR_BOUNDS,
  type CellType,
  type Character,
  type EntryKind,
  type EntryRef,
  type Locale,
  type Localized,
  type ParamDecl,
} from "./doc";
import {
  PLAY_MODEL,
  arrivalOf,
  bestItemWorth,
  cellChance,
  expectedValue,
  fairDie,
  heldChance,
  heldItemWorth,
  itemsHeldOver,
  itemsHeldUpTo,
  keptDistribution,
  meanRoll,
  outcomeWeights,
  playDice,
  reactionWorth,
  rerolledDie,
  rollDistribution,
  skipValue,
  skipWorth,
  throwDistribution,
  twoThrows,
  type ArrivalScope,
  type DiceShape,
  type PlayContext,
} from "./play-model";
import type { EntryFacts, RuleContext, RuleOutput, Stage, TriggerName } from "./runtime";
import { NO_REACTION, type ReactionRules } from "../../turn/reaction";
import { NOUNS, counted, joinOr, plural, quote, type Noun } from "./text-kit";
import {
  FixedValueSchema,
  ValueSchema,
  isSourceValue,
  isTableValue,
  resolveValue,
  tableShares,
  valueMean,
  valueParams,
  valueRange,
  type FixedValueDoc,
  type SourceValueDoc,
  type TableValueDoc,
  type ValueDoc,
  type ValueRange,
} from "./values";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** Read-only environment for text and power: no rng, values as ranges. */
export interface StaticEnv {
  params: IeeParams;
  decls: Readonly<Record<string, ParamDecl>>;
  /** Facts about referenced entries; null when the reference does not resolve. */
  resolve: (ref: EntryRef) => EntryFacts | null;
  /** The power of a referenced entry, when known — what handing it out is worth. */
  powerOf?: (entryId: string) => number | null;
}

/** Text environment: a static env plus the language being written. */
export interface TextEnv extends StaticEnv {
  locale: Locale;
}

/** Runtime environment of one firing. */
export interface RunEnv {
  params: IeeParams;
  decls: Readonly<Record<string, ParamDecl>>;
  resolve: (ref: EntryRef) => EntryFacts | null;
  /** The entry whose rule is firing — for ledger reasons. */
  entry: { slug: string; kind: EntryKind };
}

type Templates<P> = Record<Locale, (p: P, env: TextEnv) => string>;

export type Harm = "none" | "target";

/**
 * What a source reads where a rule runs (spec §6.5, wave A): the dice of the
 * roll in progress, the items the holder has, the chosen player's last roll.
 * Null when it cannot be read there — the dice not thrown yet, nobody chosen,
 * a player who has not moved — and an unreadable source is worth 0.
 */
export function readSource(source: SourceValueDoc, ctx: RuleContext): number | null {
  switch (source.source) {
    case "diceSum": {
      const faces = ctx.turn?.diceResults;
      return faces && faces.length > 0 ? faces.reduce((a, b) => a + b, 0) : null;
    }
    case "itemCount": {
      const held = ctx.selfEntries.filter((e) => e.kind === "item" && (source.character === undefined || e.character === source.character));
      return held.length * source.multiplier;
    }
    case "targetLastRoll":
      return ctx.target?.lastRoll ?? null;
  }
}

/** A value of a firing rule: its parameters, its draws, and what the moment knows. */
function runValue(value: ValueDoc, ctx: RuleContext, env: RunEnv): number {
  return resolveValue(value, { ...env, rng: ctx.rng, read: (source) => readSource(source, ctx) });
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export interface TriggerDef {
  name: TriggerName;
  stage: Stage;
  /**
   * Which kind of entry may have rules on it. Items reach the turn hooks only
   * when passive or cursed (wave A) — `placement.triggersFor` says which.
   */
  kinds: readonly EntryKind[];
  /** The turn hook it runs at; null = run by the executor. */
  hook: HookName | null;
  /** What the turn knows by then. */
  knows: { outcome: boolean; cell: boolean; dice: boolean };
  /**
   * A moment of an instance that lasts or is held — an effect's, a passive or
   * cursed item's — never an active item's, which acts when used (wave B,
   * `onIncoming`, `whileActive`).
   */
  held?: true;
  /**
   * A moment of an item standing on the board — an active item that placed
   * itself with `placeObject` (wave D, `onObjectEntered`), never a held one's.
   */
  placed?: true;
}

export const TRIGGERS: Record<TriggerName, TriggerDef> = {
  onUse: { name: "onUse", stage: 1, kinds: ["item"], hook: null, knows: { outcome: false, cell: false, dice: false } },
  onPickup: { name: "onPickup", stage: "A", kinds: ["item"], hook: null, knows: { outcome: false, cell: false, dice: false } },
  onApply: { name: "onApply", stage: 1, kinds: ["effect"], hook: null, knows: { outcome: false, cell: false, dice: false } },
  onExpire: { name: "onExpire", stage: 1, kinds: ["effect"], hook: null, knows: { outcome: false, cell: false, dice: false } },
  beforeMovement: {
    name: "beforeMovement",
    stage: 1,
    kinds: ["effect", "item"],
    hook: "beforeMovement",
    knows: { outcome: true, cell: false, dice: false },
  },
  afterDice: {
    name: "afterDice",
    stage: "A",
    kinds: ["effect", "item"],
    hook: "afterDice",
    knows: { outcome: true, cell: false, dice: true },
  },
  afterMovement: {
    name: "afterMovement",
    stage: 1,
    kinds: ["effect", "item"],
    hook: "afterMovement",
    knows: { outcome: true, cell: false, dice: true },
  },
  beforeCellEffect: {
    name: "beforeCellEffect",
    stage: 1,
    kinds: ["effect", "item"],
    hook: "beforeCellEffect",
    knows: { outcome: true, cell: true, dice: true },
  },
  afterCellEffect: {
    name: "afterCellEffect",
    stage: 1,
    kinds: ["effect", "item"],
    hook: "afterCellEffect",
    knows: { outcome: true, cell: true, dice: true },
  },
  onOutcome: {
    name: "onOutcome",
    stage: 1,
    kinds: ["effect", "item"],
    hook: "onOutcome",
    knows: { outcome: true, cell: true, dice: false },
  },
  onTick: { name: "onTick", stage: 1, kinds: ["effect", "item"], hook: "onTick", knows: { outcome: true, cell: false, dice: false } },
  onIncoming: {
    name: "onIncoming",
    stage: "B",
    kinds: ["effect", "item"],
    hook: null,
    knows: { outcome: false, cell: false, dice: false },
    held: true,
  },
  whileActive: {
    name: "whileActive",
    stage: "B",
    kinds: ["effect", "item"],
    hook: null,
    knows: { outcome: false, cell: false, dice: false },
    held: true,
  },
  // A game is about to be picked for the holder (wave C, spec §7.12): the game service asks, not the turn.
  beforeGameRoll: {
    name: "beforeGameRoll",
    stage: "C",
    kinds: ["effect", "item"],
    hook: null,
    knows: { outcome: false, cell: false, dice: false },
    held: true,
  },
  // A game is assigned to the holder (wave C, spec §6.17): the roll is written, and the game service asks.
  onRollCreated: {
    name: "onRollCreated",
    stage: "C",
    kinds: ["effect", "item"],
    hook: null,
    knows: { outcome: false, cell: false, dice: false },
    held: true,
  },
  // A regular move passes through or ends on the cell an item placed itself on (wave D, spec §6.18): the turn's walk asks.
  onObjectEntered: {
    name: "onObjectEntered",
    stage: "D",
    kinds: ["item"],
    hook: null,
    knows: { outcome: true, cell: false, dice: true },
    placed: true,
  },
  // A rival's regular move ends on the holder's cell (wave D, spec §6.19): the holder's entries, on someone else's turn.
  onSameCell: {
    name: "onSameCell",
    stage: "D",
    kinds: ["effect", "item"],
    hook: null,
    knows: { outcome: false, cell: false, dice: false },
    held: true,
  },
};

export function isTriggerName(name: string): name is TriggerName {
  return Object.hasOwn(TRIGGERS, name);
}

const ALL_TRIGGERS = Object.keys(TRIGGERS) as TriggerName[];
const KNOWS_OUTCOME = ALL_TRIGGERS.filter((t) => TRIGGERS[t].knows.outcome);
const KNOWS_CELL = ALL_TRIGGERS.filter((t) => TRIGGERS[t].knows.cell);
const KNOWS_DICE = ALL_TRIGGERS.filter((t) => TRIGGERS[t].knows.dice);
/** Moments: every trigger but `whileActive`, which a chance would answer differently each time it is asked. */
const MOMENTS = ALL_TRIGGERS.filter((t) => t !== "whileActive");
/** Triggers whose actions the executor carries out, not the turn's reducer. */
const EXECUTOR_TRIGGERS: readonly TriggerName[] = ["onUse", "onPickup", "onApply", "onExpire"];
/** Where an action may hand out or take away entries — a rival arriving on the holder's cell among them (wave D). */
const GRANTING_TRIGGERS: readonly TriggerName[] = ["onUse", "onPickup", "onApply", "onExpire", "onOutcome", "onTick", "onSameCell"];

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export interface ConditionDef<P extends { op: string }> {
  op: P["op"];
  stage: Stage;
  schema: z.ZodType<P>;
  triggers: readonly TriggerName[];
  /** True when the condition reads the item's target. */
  needsTarget(p: P): boolean;
  /** It has no form without a chosen player — offered only where one can be seen. */
  aimedOnly?: true;
  /**
   * It reads only what an effect keeps of the player its item was aimed at —
   * where they stand, their last roll — so an effect's rules may hold it at
   * the turn's hooks (spec §6.11).
   */
  remembered?: true;
  paramsUsed(p: P): string[];
  refs(p: P): EntryRef[];
  /** Conditions run in order and stop at the first false one — rng draws included. */
  evaluate(p: P, ctx: RuleContext, env: RunEnv): boolean;
  /**
   * Rough probability the condition holds — scales the rule's power. `play`
   * is what the rule's other conditions say about the turn (a pass or a drop).
   */
  likelihood(p: P, env: StaticEnv, play: PlayContext): number;
  /**
   * What the condition says about the turns its rule fires on — the play the
   * rule's actions are worth on: a pass, a penalty cell, a low throw. Absent:
   * nothing the costs read.
   */
  narrow?(p: P, env: StaticEnv, play: PlayContext): PlayContext;
  /** "the game was passed" — the generator adds "if"/"если"/"якщо" itself. */
  text: Templates<P>;
  /** `if` clauses join under one "if"; `chance` reads as its own phrase. */
  phrase: "if" | "chance";
}

const OutcomeCondition = z.strictObject({ op: z.literal("outcome"), is: z.enum(["passed", "dropped"]) });
const CellTypeCondition = z.strictObject({
  op: z.literal("cellType"),
  in: z.array(z.enum(CELL_TYPES)).min(1).max(CELL_TYPES.length),
});
const ChanceCondition = z.strictObject({ op: z.literal("chance"), percent: FixedValueSchema });
const HasEntryCondition = z
  .strictObject({
    op: z.literal("hasEntry"),
    who: z.enum(["self", "target"]),
    tag: z.string().regex(TAG_RE).optional(),
    entry: EntryRefSchema.optional(),
    character: z.enum(CHARACTERS).optional(),
  })
  .refine((c) => c.tag !== undefined || c.entry !== undefined || c.character !== undefined, {
    message: "hasEntry needs a tag, an entry or a character",
  });

export type OutcomeConditionDoc = z.infer<typeof OutcomeCondition>;
export type CellTypeConditionDoc = z.infer<typeof CellTypeCondition>;
export type ChanceConditionDoc = z.infer<typeof ChanceCondition>;
export type HasEntryConditionDoc = z.infer<typeof HasEntryCondition>;
const DiceShowCondition = z.strictObject({
  op: z.literal("diceShow"),
  /** The sum of the dice, or any single die. */
  of: z.enum(["sum", "any"]),
  cmp: z.enum(["eq", "lte", "gte"]),
  value: FixedValueSchema,
});
export type DiceShowConditionDoc = z.infer<typeof DiceShowCondition>;
/** The holder's place in the race (wave A): the leader, the last, or within the first `lte` places. */
const RankCondition = z.union([
  z.strictObject({ op: z.literal("rank"), is: z.enum(["leader", "last"]) }),
  z.strictObject({ op: z.literal("rank"), lte: z.number().int().min(1).max(50) }),
]);
export type RankConditionDoc = z.infer<typeof RankCondition>;
/** How many items the holder has (wave A): all of them, or those of a character. */
const ItemCountCondition = z.strictObject({
  op: z.literal("itemCount"),
  cmp: z.enum(["eq", "lte", "gte"]),
  value: FixedValueSchema,
  character: z.enum(CHARACTERS).optional(),
});
export type ItemCountConditionDoc = z.infer<typeof ItemCountCondition>;
/** Where the chosen player stands (wave A): ahead of the holder, or behind. */
const TargetRelativeCondition = z.strictObject({ op: z.literal("targetRelative"), is: z.enum(["ahead", "behind"]) });
export type TargetRelativeConditionDoc = z.infer<typeof TargetRelativeCondition>;
/** «Магнит» (wave A): the dice of the holder's roll against the chosen player's last roll. */
const CompareLastRollCondition = z.strictObject({
  op: z.literal("compareLastRoll"),
  mine: z.literal("next"),
  cmp: z.enum(["lt", "gt"]),
  theirs: z.literal("target"),
});
export type CompareLastRollConditionDoc = z.infer<typeof CompareLastRollCondition>;
/** What is about to reach the holder (wave B, spec §6.13): a rival's harmful action, an entry, a move back. */
const IncomingCondition = z
  .strictObject({
    op: z.literal("incoming"),
    is: z.enum(["harm", "entry", "moveBack"]),
    kind: z.enum(ENTRY_KINDS).optional(),
    character: z.enum(CHARACTERS).optional(),
  })
  .refine((c) => c.is === "entry" || (c.kind === undefined && c.character === undefined), {
    message: "a kind and a character narrow an entry",
  });
export type IncomingConditionDoc = z.infer<typeof IncomingCondition>;
export type ConditionDoc =
  | OutcomeConditionDoc
  | CellTypeConditionDoc
  | ChanceConditionDoc
  | HasEntryConditionDoc
  | DiceShowConditionDoc
  | RankConditionDoc
  | ItemCountConditionDoc
  | TargetRelativeConditionDoc
  | CompareLastRollConditionDoc
  | IncomingConditionDoc;
export type ConditionOp = ConditionDoc["op"];

/** Cell names as the object of "land on" and of "ended on". */
export const CELL_NAMES: Record<Locale, Record<CellType, { to: string; at: string }>> = {
  en: {
    start: { to: "the start cell", at: "the start cell" },
    finish: { to: "the finish cell", at: "the finish cell" },
    normal: { to: "a plain cell", at: "a plain cell" },
    penalty: { to: "a penalty cell", at: "a penalty cell" },
    event: { to: "an event cell", at: "an event cell" },
    bonus: { to: "a bonus cell", at: "a bonus cell" },
    teleport: { to: "a teleport cell", at: "a teleport cell" },
    custom: { to: "a special cell", at: "a special cell" },
  },
  ru: {
    start: { to: "стартовую клетку", at: "стартовой клетке" },
    finish: { to: "финишную клетку", at: "финишной клетке" },
    normal: { to: "обычную клетку", at: "обычной клетке" },
    penalty: { to: "штрафную клетку", at: "штрафной клетке" },
    event: { to: "клетку события", at: "клетке события" },
    bonus: { to: "бонусную клетку", at: "бонусной клетке" },
    teleport: { to: "клетку телепорта", at: "клетке телепорта" },
    custom: { to: "особую клетку", at: "особой клетке" },
  },
  uk: {
    start: { to: "стартову клітинку", at: "стартовій клітинці" },
    finish: { to: "фінішну клітинку", at: "фінішній клітинці" },
    normal: { to: "звичайну клітинку", at: "звичайній клітинці" },
    penalty: { to: "штрафну клітинку", at: "штрафній клітинці" },
    event: { to: "клітинку події", at: "клітинці події" },
    bonus: { to: "бонусну клітинку", at: "бонусній клітинці" },
    teleport: { to: "клітинку телепорту", at: "клітинці телепорту" },
    custom: { to: "особливу клітинку", at: "особливій клітинці" },
  },
};

/** "a penalty cell or an event cell", in the case the sentence needs. */
export function cellList(locale: Locale, types: readonly CellType[], form: "to" | "at"): string {
  return joinOr(
    locale,
    types.map((t) => CELL_NAMES[locale][t][form]),
  );
}

const SUBJECT_HAS: Record<Locale, Record<"self" | "target", string>> = {
  en: { self: "you have", target: "the chosen player has" },
  ru: { self: "у вас есть", target: "у выбранного игрока есть" },
  uk: { self: "у вас є", target: "в обраного гравця є" },
};

const ITEM_OR_EFFECT: Record<Locale, Record<Character | "any", string>> = {
  en: { any: "an item or effect", bonus: "a bonus item or effect", penalty: "a penalty item or effect" },
  ru: { any: "предмет или эффект", bonus: "бонусный предмет или эффект", penalty: "штрафной предмет или эффект" },
  uk: { any: "предмет або ефект", bonus: "бонусний предмет або ефект", penalty: "штрафний предмет або ефект" },
};

const TAGGED: Record<Locale, (tag: string) => string> = {
  en: (tag) => ` tagged ${quote("en", tag)}`,
  ru: (tag) => ` с меткой ${quote("ru", tag)}`,
  uk: (tag) => ` з міткою ${quote("uk", tag)}`,
};

/** Display name of a referenced entry; the slug when it does not resolve. */
export function refName(ref: EntryRef, env: TextEnv): string {
  const facts = env.resolve(ref);
  if (!facts) return ref.slug ?? ref.entry;
  return facts.name[env.locale] ?? facts.name.ru;
}

function hasEntryObject(p: HasEntryConditionDoc, env: TextEnv): string {
  if (p.entry) return quote(env.locale, refName(p.entry, env));
  const base = ITEM_OR_EFFECT[env.locale][p.character ?? "any"];
  return p.tag ? `${base}${TAGGED[env.locale](p.tag)}` : base;
}

function percentOf(value: FixedValueDoc, env: { params: IeeParams; decls: StaticEnv["decls"] }): number {
  return valueRange(value, env.params, env.decls).max;
}

const compare = (cmp: DiceShowConditionDoc["cmp"], a: number, b: number) =>
  cmp === "eq" ? a === b : cmp === "lte" ? a <= b : a >= b;

/** How often a pass's (or a drop's) dice meet a `diceShow` condition. */
function diceChance(p: DiceShowConditionDoc, value: number, shape: DiceShape): number {
  if (p.of === "sum") return expectedValue(throwDistribution(shape), (sum) => (compare(p.cmp, sum, value) ? 1 : 0));
  const die = fairDie(Math.max(2, shape.sides));
  const one = die.reduce((acc, q, face) => acc + (face > 0 && compare(p.cmp, face, value) ? q : 0), 0);
  return 1 - (1 - one) ** shape.count;
}

const DICE_CMP: Record<Locale, Record<DiceShowConditionDoc["cmp"], (n: number) => string>> = {
  en: { eq: (n) => `${n}`, lte: (n) => `${n} or less`, gte: (n) => `${n} or more` },
  ru: { eq: (n) => `${n}`, lte: (n) => `${n} или меньше`, gte: (n) => `${n} или больше` },
  uk: { eq: (n) => `${n}`, lte: (n) => `${n} або менше`, gte: (n) => `${n} або більше` },
};

// --- wave A: standing, items held, the chosen player ------------------------

const RANK_WORDS: Record<Locale, { leader: string; last: string; top: (n: number) => string }> = {
  en: { leader: "you are in the lead", last: "you are last", top: (n) => `you are among the first ${n}` },
  ru: { leader: "вы лидируете", last: "вы на последнем месте", top: (n) => `вы среди первых ${n}` },
  uk: { leader: "ви лідируєте", last: "ви на останньому місці", top: (n) => `ви серед перших ${n}` },
};

function rankText(locale: Locale, p: RankConditionDoc): string {
  const words = RANK_WORDS[locale];
  if ("lte" in p) return p.lte === 1 ? words.leader : words.top(p.lte);
  return words[p.is];
}

type SlavicForms = readonly [one: string, few: string, many: string];

/** Items held, in the agreement each language needs: "2 cursed items", "2 проклятых предмета". */
const HELD_WORDS: {
  en: { adj: Record<Character, string>; cmp: Record<"eq" | "lte" | "gte", (amount: string) => string>; none: (adj: string) => string };
  ru: { noun: SlavicForms; adj: Record<Character, SlavicForms>; cmp: Record<"eq" | "lte" | "gte", (amount: string) => string>; none: (adj: string) => string };
  uk: { noun: SlavicForms; adj: Record<Character, SlavicForms>; cmp: Record<"eq" | "lte" | "gte", (amount: string) => string>; none: (adj: string) => string };
} = {
  en: {
    adj: { bonus: "bonus ", penalty: "cursed " },
    cmp: { eq: (a) => `you hold exactly ${a}`, lte: (a) => `you hold ${a} or fewer`, gte: (a) => `you hold ${a} or more` },
    none: (adj) => `you hold no ${adj}items`,
  },
  ru: {
    noun: ["предмет", "предмета", "предметов"],
    adj: { bonus: ["бонусный", "бонусных", "бонусных"], penalty: ["проклятый", "проклятых", "проклятых"] },
    cmp: { eq: (a) => `у вас ровно ${a}`, lte: (a) => `у вас ${a} или меньше`, gte: (a) => `у вас ${a} или больше` },
    none: (adj) => `у вас нет ${adj}предметов`,
  },
  uk: {
    noun: ["предмет", "предмети", "предметів"],
    adj: { bonus: ["бонусний", "бонусні", "бонусних"], penalty: ["проклятий", "прокляті", "проклятих"] },
    cmp: { eq: (a) => `у вас рівно ${a}`, lte: (a) => `у вас ${a} або менше`, gte: (a) => `у вас ${a} або більше` },
    none: (adj) => `у вас немає ${adj}предметів`,
  },
};

/** "2 bonus items", "2 бонусных предмета", "2 бонусні предмети" — a count of held items. */
function heldAmount(locale: Locale, n: number, character: Character | undefined): string {
  if (locale === "en") return `${n} ${character ? HELD_WORDS.en.adj[character] : ""}${n === 1 ? "item" : "items"}`;
  const words = HELD_WORDS[locale];
  const i = slavicIndex(n);
  return `${n} ${character ? `${words.adj[character][i]} ` : ""}${words.noun[i]}`;
}

function itemCountText(locale: Locale, p: ItemCountConditionDoc, env: TextEnv): string {
  const n = percentOf(p.value, env);
  // None at all reads as such: "you hold no cursed items".
  if (n <= 0 && p.cmp !== "gte") {
    const adj = p.character === undefined ? "" : locale === "en" ? HELD_WORDS.en.adj[p.character] : `${HELD_WORDS[locale].adj[p.character][2]} `;
    return HELD_WORDS[locale].none(adj);
  }
  return HELD_WORDS[locale].cmp[p.cmp](heldAmount(locale, n, p.character));
}

const TARGET_RELATIVE: Record<Locale, Record<TargetRelativeConditionDoc["is"], string>> = {
  en: { ahead: "the chosen player is ahead of you", behind: "the chosen player is behind you" },
  ru: { ahead: "выбранный игрок впереди вас", behind: "выбранный игрок позади вас" },
  uk: { ahead: "обраний гравець попереду вас", behind: "обраний гравець позаду вас" },
};

const LAST_ROLL_CMP: Record<Locale, Record<CompareLastRollConditionDoc["cmp"], string>> = {
  en: { lt: "your roll is lower than the chosen player's last roll", gt: "your roll is higher than the chosen player's last roll" },
  ru: { lt: "ваш бросок меньше последнего броска выбранного игрока", gt: "ваш бросок больше последнего броска выбранного игрока" },
  uk: { lt: "ваш кидок менший за останній кидок обраного гравця", gt: "ваш кидок більший за останній кидок обраного гравця" },
};

/**
 * How often the holder's roll comes out lower (or higher) than a rival's last
 * one — theirs a pass or a drop at their rates, the holder's on the turns the
 * rule fires on.
 */
function lastRollChance(cmp: CompareLastRollConditionDoc["cmp"], outcome: PlayContext["outcome"]): number {
  const mine = rollDistribution(outcome);
  const theirs = rollDistribution(null);
  let chance = 0;
  mine.forEach((p, a) => {
    if (p === 0) return;
    theirs.forEach((q, b) => {
      if (q > 0 && (cmp === "lt" ? a < b : a > b)) chance += p * q;
    });
  });
  return chance;
}

// --- what arrives (wave B, spec §6.13) -------------------------------------------

/** What an `incoming` condition lets through, as the play model reads it. */
export function arrivalScope(p: IncomingConditionDoc): ArrivalScope {
  return p.is === "entry" ? { is: "entry", kind: p.kind ?? null, character: p.character ?? null } : { is: p.is };
}

/** What an entry arriving is called: "a cursed item", "a bonus item or effect". */
const ARRIVING_ENTRY: Record<Locale, Record<"any" | Character, Record<"any" | EntryKind, string>>> = {
  en: {
    any: { any: "an item or effect", item: "an item", effect: "an effect" },
    bonus: { any: "a bonus item or effect", item: "a bonus item", effect: "a bonus effect" },
    penalty: { any: "a cursed item or a penalty effect", item: "a cursed item", effect: "a penalty effect" },
  },
  ru: {
    any: { any: "предмет или эффект", item: "предмет", effect: "эффект" },
    bonus: { any: "бонусный предмет или эффект", item: "бонусный предмет", effect: "бонусный эффект" },
    penalty: { any: "проклятый предмет или штрафной эффект", item: "проклятый предмет", effect: "штрафной эффект" },
  },
  uk: {
    any: { any: "предмет або ефект", item: "предмет", effect: "ефект" },
    bonus: { any: "бонусний предмет або ефект", item: "бонусний предмет", effect: "бонусний ефект" },
    penalty: { any: "проклятий предмет або штрафний ефект", item: "проклятий предмет", effect: "штрафний ефект" },
  },
};

/** "a rival aims a harmful action at you", "you receive a penalty effect" — what an `incoming` condition waits for. */
export function incomingClause(locale: Locale, p: IncomingConditionDoc): string {
  if (p.is === "harm") {
    return locale === "en"
      ? "a rival aims a harmful action at you"
      : locale === "ru"
        ? "соперник направляет на вас вредное действие"
        : "суперник спрямовує на вас шкідливу дію";
  }
  if (p.is === "moveBack") {
    return locale === "en"
      ? "an item or effect is about to move you back"
      : locale === "ru"
        ? "предмет или эффект вот-вот отбросит вас назад"
        : "предмет або ефект ось-ось відкине вас назад";
  }
  const what = ARRIVING_ENTRY[locale][p.character ?? "any"][p.kind ?? "any"];
  return locale === "en" ? `you receive ${what}` : locale === "ru" ? `вы получаете ${what}` : `ви отримуєте ${what}`;
}

export const CONDITIONS: { [K in ConditionOp]: ConditionDef<Extract<ConditionDoc, { op: K }>> } = {
  outcome: {
    op: "outcome",
    stage: 1,
    schema: OutcomeCondition,
    triggers: KNOWS_OUTCOME,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    evaluate: (p, ctx) => ctx.turn?.outcome === p.is,
    likelihood: (p) => (p.is === "passed" ? 0.6 : 0.4),
    narrow: (p, _env, play) => ({ ...play, outcome: p.is }),
    phrase: "if",
    text: {
      en: (p) => (p.is === "passed" ? "the game was passed" : "the game was dropped"),
      ru: (p) => (p.is === "passed" ? "игра пройдена" : "игра дропнута"),
      uk: (p) => (p.is === "passed" ? "гру пройдено" : "гру дропнуто"),
    },
  },
  cellType: {
    op: "cellType",
    stage: 1,
    schema: CellTypeCondition,
    triggers: KNOWS_CELL,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    evaluate: (p, ctx) => {
      const cell = ctx.turn?.cellType;
      return cell !== undefined && (p.in as readonly string[]).includes(cell);
    },
    likelihood: (p) => cellChance(p.in),
    narrow: (p, _env, play) => ({ ...play, cells: p.in as readonly CellType[] }),
    phrase: "if",
    text: {
      en: (p) => `the move ended on ${cellList("en", p.in, "at")}`,
      ru: (p) => `ход закончился на ${cellList("ru", p.in, "at")}`,
      uk: (p) => `хід закінчився на ${cellList("uk", p.in, "at")}`,
    },
  },
  chance: {
    op: "chance",
    stage: 1,
    schema: ChanceCondition,
    triggers: MOMENTS,
    needsTarget: () => false,
    paramsUsed: (p) => valueParams(p.percent),
    refs: () => [],
    evaluate: (p, ctx, env) => {
      const percent = Math.max(0, Math.min(100, runValue(p.percent, ctx, env)));
      return ctx.rng() * 100 < percent;
    },
    likelihood: (p, env) => Math.max(0, Math.min(100, percentOf(p.percent, env))) / 100,
    phrase: "chance",
    text: {
      en: (p, env) => `with a ${percentOf(p.percent, env)}% chance`,
      ru: (p, env) => `с вероятностью ${percentOf(p.percent, env)}%`,
      uk: (p, env) => `з імовірністю ${percentOf(p.percent, env)}%`,
    },
  },
  hasEntry: {
    op: "hasEntry",
    stage: 1,
    schema: HasEntryCondition,
    triggers: ALL_TRIGGERS,
    needsTarget: (p) => p.who === "target",
    paramsUsed: () => [],
    refs: (p) => (p.entry ? [p.entry] : []),
    evaluate: (p, ctx) => {
      const entries = p.who === "self" ? ctx.selfEntries : ctx.targetEntries;
      return entries.some(
        (e) =>
          (p.entry === undefined || e.entryId === p.entry.entry) &&
          (p.tag === undefined || e.tags.includes(p.tag)) &&
          (p.character === undefined || e.character === p.character),
      );
    },
    likelihood: () => 0.5,
    phrase: "if",
    text: {
      en: (p, env) => `${SUBJECT_HAS.en[p.who]} ${hasEntryObject(p, env)}`,
      ru: (p, env) => `${SUBJECT_HAS.ru[p.who]} ${hasEntryObject(p, env)}`,
      uk: (p, env) => `${SUBJECT_HAS.uk[p.who]} ${hasEntryObject(p, env)}`,
    },
  },
  diceShow: {
    op: "diceShow",
    stage: "A",
    schema: DiceShowCondition,
    triggers: KNOWS_DICE,
    needsTarget: () => false,
    paramsUsed: (p) => valueParams(p.value),
    refs: () => [],
    evaluate: (p, ctx, env) => {
      const faces = ctx.turn?.diceResults;
      if (!faces || faces.length === 0) return false;
      const value = runValue(p.value, ctx, env);
      if (p.of === "sum") return compare(p.cmp, faces.reduce((a, b) => a + b, 0), value);
      return faces.some((face) => compare(p.cmp, face, value));
    },
    likelihood: (p, env, play) => {
      const value = percentOf(p.value, env);
      const dice = playDice(play);
      const pass = diceChance(p, value, dice.pass);
      const drop = diceChance(p, value, dice.drop);
      if (play.outcome === "passed") return pass;
      if (play.outcome === "dropped") return drop;
      return PLAY_MODEL.passRate * pass + (1 - PLAY_MODEL.passRate) * drop;
    },
    // A sum it asks for is the throw the rule's actions take or change: two or less is a short move.
    narrow: (p, env, play) => {
      if (p.of !== "sum") return play;
      const value = percentOf(p.value, env);
      const before = play.sum;
      return { ...play, sum: (sum) => compare(p.cmp, sum, value) && (before ? before(sum) : true) };
    },
    phrase: "if",
    text: {
      en: (p, env) => `${p.of === "sum" ? "the dice show" : "a die shows"} ${DICE_CMP.en[p.cmp](percentOf(p.value, env))}`,
      ru: (p, env) =>
        `${p.of === "sum" ? "на кубиках выпало" : "на одном из кубиков выпало"} ${DICE_CMP.ru[p.cmp](percentOf(p.value, env))}`,
      uk: (p, env) =>
        `${p.of === "sum" ? "на кубиках випало" : "на одному з кубиків випало"} ${DICE_CMP.uk[p.cmp](percentOf(p.value, env))}`,
    },
  },
  rank: {
    op: "rank",
    stage: "A",
    schema: RankCondition,
    triggers: ALL_TRIGGERS,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    // The place the holder had when the rule started: a move does not re-rank them halfway.
    evaluate: (p, ctx) => {
      if ("lte" in p) return ctx.self.rank <= p.lte;
      if (p.is === "leader") return ctx.self.rank === 1;
      return ctx.self.behind === 0;
    },
    likelihood: (p) => Math.min(1, ("lte" in p ? p.lte : 1) / PLAY_MODEL.field),
    phrase: "if",
    text: {
      en: (p) => rankText("en", p),
      ru: (p) => rankText("ru", p),
      uk: (p) => rankText("uk", p),
    },
  },
  itemCount: {
    op: "itemCount",
    stage: "A",
    schema: ItemCountCondition,
    triggers: ALL_TRIGGERS,
    needsTarget: () => false,
    paramsUsed: (p) => valueParams(p.value),
    refs: () => [],
    evaluate: (p, ctx, env) => {
      const held = ctx.selfEntries.filter((e) => e.kind === "item" && (p.character === undefined || e.character === p.character));
      return compare(p.cmp, held.length, runValue(p.value, ctx, env));
    },
    likelihood: (p, env) => heldChance(p.character ?? null, p.cmp, percentOf(p.value, env)),
    phrase: "if",
    text: {
      en: (p, env) => itemCountText("en", p, env),
      ru: (p, env) => itemCountText("ru", p, env),
      uk: (p, env) => itemCountText("uk", p, env),
    },
  },
  targetRelative: {
    op: "targetRelative",
    stage: "A",
    schema: TargetRelativeCondition,
    triggers: ALL_TRIGGERS,
    needsTarget: () => true,
    aimedOnly: true,
    remembered: true,
    paramsUsed: () => [],
    refs: () => [],
    evaluate: (p, ctx) => {
      if (ctx.target === null) return false;
      return p.is === "ahead" ? ctx.target.position > ctx.self.position : ctx.target.position < ctx.self.position;
    },
    likelihood: () => 0.5,
    phrase: "if",
    text: {
      en: (p) => TARGET_RELATIVE.en[p.is],
      ru: (p) => TARGET_RELATIVE.ru[p.is],
      uk: (p) => TARGET_RELATIVE.uk[p.is],
    },
  },
  compareLastRoll: {
    op: "compareLastRoll",
    stage: "A",
    schema: CompareLastRollCondition,
    triggers: KNOWS_DICE,
    needsTarget: () => true,
    aimedOnly: true,
    remembered: true,
    paramsUsed: () => [],
    refs: () => [],
    evaluate: (p, ctx) => {
      const faces = ctx.turn?.diceResults;
      const theirs = ctx.target?.lastRoll;
      // Nobody chosen, or a player who has not moved yet: nothing to compare with.
      if (!faces || faces.length === 0 || theirs === null || theirs === undefined) return false;
      const mine = faces.reduce((a, b) => a + b, 0);
      return p.cmp === "lt" ? mine < theirs : mine > theirs;
    },
    likelihood: (p, _env, play) => lastRollChance(p.cmp, play.outcome),
    phrase: "if",
    text: {
      en: (p) => LAST_ROLL_CMP.en[p.cmp],
      ru: (p) => LAST_ROLL_CMP.ru[p.cmp],
      uk: (p) => LAST_ROLL_CMP.uk[p.cmp],
    },
  },
  incoming: {
    op: "incoming",
    stage: "B",
    schema: IncomingCondition,
    triggers: ["onIncoming"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    evaluate: (p, ctx) => {
      const arrival = ctx.arrival;
      if (!arrival || arrival.is !== p.is) return false;
      if (p.is !== "entry") return true;
      return (p.kind === undefined || arrival.entry?.kind === p.kind) && (p.character === undefined || arrival.entry?.character === p.character);
    },
    // As often as such an arrival comes in a roll; it says what the rule's answer is worth.
    likelihood: (p) => arrivalOf(arrivalScope(p)).perRoll,
    narrow: (p, _env, play) => ({ ...play, incoming: arrivalScope(p) }),
    phrase: "if",
    text: {
      en: (p) => incomingClause("en", p),
      ru: (p) => incomingClause("ru", p),
      uk: (p) => incomingClause("uk", p),
    },
  },
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ActionDef<P extends { op: string }> {
  op: P["op"];
  stage: Stage;
  schema: z.ZodType<P>;
  triggers: readonly TriggerName[];
  /** True when the action reaches the item's target. */
  needsTarget(p: P): boolean;
  /** It has no form without a chosen player — offered only where there is one. */
  aimedOnly?: true;
  /**
   * It acts on the throw in the reaction window (wave B, spec §6.15): it may
   * stand at a reaction item's `onUse`, which reads it as `afterDice` reads it.
   */
  reacts?: true;
  /** It stands at a reaction item's `onUse` and nowhere else (`reroll`). */
  reactionOnly?: true;
  /**
   * It reads what an item's use picked (wave C, `poolFavor`, spec §6.16): only
   * an effect remembers a pick, so only an effect's rules are offered it.
   */
  readsPick?: true;
  /**
   * It acts on the user's game in flight (wave C, `rerollGame`, `postponeGame`,
   * spec §6.16): it stands at the use of an item used on an open roll only.
   */
  openRollOnly?: true;
  /**
   * It places the item on the board (wave D, `placeObject`, spec §6.18): it
   * stands at the use of an item that asks for a cell, and nowhere else.
   */
  placesOnly?: true;
  /** It moves the item itself (wave D, `takeEntry`, spec §6.19): an effect cannot be taken. */
  itemsOnly?: true;
  /**
   * The value fields that may read a source (wave A, spec §6.5): those whose
   * sentence can say "by the dice result" or "1 for each item you hold".
   */
  sourceFields?: readonly string[];
  paramsUsed(p: P): string[];
  /** Entries this action references, with the kind each must be. */
  refs(p: P): { ref: EntryRef; kind: EntryKind }[];
  /**
   * Harm to the target (spec §7.8, D9): what protection and interception react
   * to. A property of the action, not of the entry that carries it.
   */
  harm(p: P, env: StaticEnv): Harm;
  /** Adds the action's contribution. Pure apart from `ctx.rng`. */
  apply(p: P, ctx: RuleContext, env: RunEnv, out: RuleOutput): void;
  /**
   * What one firing is worth, in cells (spec §14; `./play-model`), on the
   * turns the rule's conditions let it fire on.
   */
  cost(p: P, env: StaticEnv, play: PlayContext): number;
  /**
   * Which way a firing goes (spec §14): 1 when it helps the holder — or, aimed
   * at the chosen player, the user — and -1 when it sets them back. An entry's
   * power is what its actions come to together, so a drawback («Кости
   * судьбы»: no move on a low sum) takes from the gain. Absent: it helps.
   */
  sign?(p: P, env: StaticEnv, play: PlayContext): Sign;
  text: Templates<P>;
}

/** The way a firing goes for the holder (`ActionDef.sign`). */
export type Sign = 1 | -1;

/** A worth's way: setbacks are negative. */
const signOf = (worth: number): Sign => (worth < 0 ? -1 : 1);

const StepsAction = z.strictObject({ op: z.literal("steps"), delta: ValueSchema });
const DiceAction = z
  .strictObject({ op: z.literal("dice"), count: ValueSchema.optional(), sides: ValueSchema.optional() })
  .refine((a) => a.count !== undefined || a.sides !== undefined, { message: "dice needs count or sides" });
const BalanceAction = z.strictObject({
  op: z.literal("balance"),
  amount: ValueSchema,
  to: z.enum(["self", "target"]).optional(),
});
const SkipCellEffectAction = z.strictObject({ op: z.literal("skipCellEffect") });
const NoMoveAction = z.strictObject({ op: z.literal("noMove") });
const GrantEffectAction = z.strictObject({
  op: z.literal("grantEffect"),
  entry: EntryRefSchema,
  to: z.enum(["self", "target"]),
});
const GrantItemAction = z.strictObject({
  op: z.literal("grantItem"),
  entry: EntryRefSchema,
  to: z.enum(["self", "target"]),
});
const CleanseAction = z.strictObject({
  op: z.literal("cleanse"),
  character: z.enum(CHARACTERS).optional(),
  tags: z.array(z.string().regex(TAG_RE)).min(1).max(8).optional(),
  count: z.union([z.number().int().min(1).max(99), z.literal("all")]),
});

// The dice pipeline (spec §7.2), all at `afterDice`.
const RerollOnAction = z.strictObject({
  op: z.literal("rerollOn"),
  values: z.array(z.number().int().min(1).max(20)).min(1).max(6),
});
const BestOfTwoAction = z.strictObject({ op: z.literal("bestOfTwo") });
const WorstOfTwoAction = z.strictObject({ op: z.literal("worstOfTwo") });
const ResultModifyAction = z
  .strictObject({ op: z.literal("resultModify"), delta: ValueSchema.optional(), cap: FixedValueSchema.optional() })
  .refine((a) => a.delta !== undefined || a.cap !== undefined, { message: "resultModify needs a delta or a cap" });
const DirectionAction = z.strictObject({ op: z.literal("direction"), lowerHalf: z.literal("back") });
// A reaction item's throw again (wave B, spec §6.15).
const RerollAction = z.strictObject({ op: z.literal("reroll") });

// Out-of-turn moves (spec §7.3): a position change only — no cell, no wheel.
const MoveAction = z.strictObject({
  op: z.literal("move"),
  by: ValueSchema,
  who: z.enum(["self", "target"]).optional(),
});
const MoveToTargetAction = z.strictObject({ op: z.literal("moveToTarget"), at: z.enum(["cell", "before"]) });
const SwapPositionsAction = z.strictObject({ op: z.literal("swapPositions"), with: z.enum(["target", "nearestBehind"]) });
const RollbackLastMoveAction = z.strictObject({ op: z.literal("rollbackLastMove"), who: z.enum(["self", "target"]) });
const HalveGapAction = z.strictObject({ op: z.literal("halveGap"), who: z.literal("nearestBehind") });

/** Only entries of these rarities (wave B): each listed once. */
const RarityFilter = z
  .array(z.enum(RARITIES))
  .min(1)
  .max(RARITIES.length)
  .refine((list) => new Set(list).size === list.length, { message: "a rarity is listed once" });

// Cursed and passive items (spec §6.10): taking instances away.
const RemoveAction = z
  .strictObject({
    op: z.literal("remove"),
    what: z.enum(["effect", "item", "any"]),
    character: z.enum(CHARACTERS).optional(),
    /** One entry only — then `what` names its kind. */
    entry: EntryRefSchema.optional(),
    /** Only instances of entries of these rarities (wave B) — «Философский камень» turns a common item. */
    rarity: RarityFilter.optional(),
    pick: z.enum(["choice", "newest", "random"]),
    count: z.number().int().min(1).max(8).optional(),
    from: z.enum(["self", "target"]).optional(),
  })
  .refine((a) => a.entry === undefined || a.what !== "any", { message: "an entry is an effect or an item, not both" })
  .refine((a) => a.entry === undefined || a.rarity === undefined, { message: "one entry has one rarity" })
  .refine((a) => a.pick !== "choice" || ((a.count ?? 1) === 1 && (a.from ?? "self") === "self"), {
    message: "a choice is one of the user's own",
  });

// Item operations (spec §6.12, wave B): bonus items change hands, are copied
// and chosen from the season's catalog; the wheel spins once more.
const ItemCount = z.number().int().min(1).max(8);
const StealItemAction = z.strictObject({ op: z.literal("stealItem"), count: ItemCount.optional(), rarity: RarityFilter.optional() });
const TransferItemAction = z.strictObject({
  op: z.literal("transferItem"),
  to: z.enum(["target", "randomRival"]),
  count: ItemCount.optional(),
  rarity: RarityFilter.optional(),
});
const SwapItemsAction = z.strictObject({ op: z.literal("swapItems"), rarity: RarityFilter.optional() });
const CopyItemAction = z.strictObject({ op: z.literal("copyItem"), rarity: RarityFilter.optional() });
const GrantChosenAction = z.strictObject({
  op: z.literal("grantChosen"),
  rarity: RarityFilter.optional(),
  activation: z.enum(["active", "passive"]).optional(),
});
const ExtraSpinAction = z.strictObject({ op: z.literal("extraSpin"), pool: z.enum(["bonus", "penalty"]) });

// What arrives, and protection (spec §6.13, wave B): answers at `onIncoming`,
// standing states at `whileActive`.
const BlockAction = z.strictObject({ op: z.literal("block") });
const ReflectAction = z.strictObject({ op: z.literal("reflect") });
const AmplifyAction = z.strictObject({ op: z.literal("amplify"), factor: z.union([z.literal(2), z.literal(3)]) });
const ReplaceAction = z.strictObject({ op: z.literal("replace"), with: z.number().int().min(0).max(6) });
const UntargetableAction = z.strictObject({ op: z.literal("untargetable") });
const ForbidItemsAction = z.strictObject({ op: z.literal("forbidItems") });
const PierceAction = z.strictObject({ op: z.literal("pierce"), value: z.union([z.literal(1), z.literal(2)]) });

// The player's choices (spec §6.14, wave B): what to give up, what to keep.
const VictimChoiceAction = z.strictObject({
  op: z.literal("victimChoice"),
  count: z.number().int().min(1).max(3).optional(),
  orKeep: z.literal(true).optional(),
});
const HoldLimitAction = z.strictObject({ op: z.literal("holdLimit"), max: z.number().int().min(1).max(3) });

// The next game (spec §6.16, wave C): which games the draw may hand the holder.
/** The holder's own genre sets: what the use picked, their last passed game's, every game's they passed. */
export const GENRE_SETS = ["picked", "lastPassed", "passed"] as const;
const GenreSet = z.union([
  z
    .array(GenreSchema)
    .min(1)
    .max(8)
    .refine((list) => new Set(list).size === list.length, { message: "a genre is listed once" }),
  z.enum(GENRE_SETS),
]);
/** A release year: a literal, or a parameter the season may tune — bounded the same way by the checks. */
const YearBound = z.union([
  z.number().int().min(YEAR_BOUNDS.min).max(YEAR_BOUNDS.max),
  z.strictObject({ param: z.string().regex(PARAM_NAME_RE) }),
]);
const YearSpan = z.union([
  z.literal("picked"),
  z
    .strictObject({ min: YearBound.optional(), max: YearBound.optional() })
    .refine((s) => s.min !== undefined || s.max !== undefined, { message: "a span of years needs a first or a last year" })
    .refine((s) => typeof s.min !== "number" || typeof s.max !== "number" || s.min <= s.max, {
      message: "the first year must not come after the last",
    }),
]);
/** The catalog's rating, 0–5. */
const RatingSpan = z
  .strictObject({ min: z.number().min(0).max(5).optional(), max: z.number().min(0).max(5).optional() })
  .refine((s) => s.min !== undefined || s.max !== undefined, { message: "a rating needs a lowest or a highest" })
  .refine((s) => s.min === undefined || s.max === undefined || s.min <= s.max, { message: "the lowest rating must not exceed the highest" });
const poolMatch = { genres: GenreSet.optional(), years: YearSpan.optional(), rating: RatingSpan.optional() };
const namesGames = (p: { genres?: unknown; years?: unknown; rating?: unknown }) =>
  p.genres !== undefined || p.years !== undefined || p.rating !== undefined;
const PoolExcludeAction = z
  .strictObject({ op: z.literal("poolExclude"), ...poolMatch })
  .refine(namesGames, { message: "poolExclude needs genres, years or a rating" });
const PoolRequireAction = z
  .strictObject({ op: z.literal("poolRequire"), ...poolMatch })
  .refine(namesGames, { message: "poolRequire needs genres, years or a rating" });
const PoolFavorAction = z.strictObject({ op: z.literal("poolFavor"), factor: z.number().int().min(2).max(5) });
/** The draw offers that many games and the holder takes one (wave C, spec §7.12). */
const ChooseOfNAction = z.strictObject({ op: z.literal("chooseOfN"), n: z.number().int().min(2).max(5) });
// The game in flight (spec §6.16): an item used on an open roll replaces it, or sets it aside.
const RerollGameAction = z.strictObject({ op: z.literal("rerollGame") });
/** How many picks later a set-aside game comes back, counting the one now. */
export const AFTER_ROLLS = { min: 2, max: 4, default: 2 } as const;
const PostponeGameAction = z.strictObject({
  op: z.literal("postponeGame"),
  afterRolls: z.number().int().min(AFTER_ROLLS.min).max(AFTER_ROLLS.max).optional(),
});
// Completion conditions (spec §6.17): what the holder must do for their game to count as passed.
/** The game gets a completion condition — passed with it or not at all; its text in each language. */
const AddConditionAction = z.strictObject({ op: z.literal("addCondition"), text: LocalizedSchema(LIMITS.conditionTextLength) });
/** The holder's games get no completion conditions while it holds. */
const ConditionImmunityAction = z.strictObject({ op: z.literal("conditionImmunity") });
// Board objects (spec §6.18, wave D): an item that places itself on a cell, and what it does to whoever enters it.
/** The item, used, stands on the cell its user picked. */
const PlaceObjectAction = z.strictObject({ op: z.literal("placeObject") });
/** The move ends on the object's cell: the cells it had left are lost and no cell fires. */
const StopMoveAction = z.strictObject({ op: z.literal("stopMove") });
/** After the stop, the mover is moved that many cells — back when negative. */
const PushAction = z.strictObject({ op: z.literal("push"), delta: ValueSchema });
/** The move goes that many cells further, in its own direction. */
const ExtendAction = z.strictObject({ op: z.literal("extend"), delta: ValueSchema });
/** That wheel spins for the mover in place of the cell. */
const SpinInsteadAction = z.strictObject({ op: z.literal("spinInstead"), pool: z.enum(["bonus", "penalty"]) });
// The same cell (spec §6.19, wave D).
/** The rival whose regular move ended on the holder's cell takes this item, as it is. */
const TakeEntryAction = z.strictObject({ op: z.literal("takeEntry") });

export type StepsActionDoc = z.infer<typeof StepsAction>;
export type DiceActionDoc = z.infer<typeof DiceAction>;
export type BalanceActionDoc = z.infer<typeof BalanceAction>;
export type SkipCellEffectActionDoc = z.infer<typeof SkipCellEffectAction>;
export type NoMoveActionDoc = z.infer<typeof NoMoveAction>;
export type GrantEffectActionDoc = z.infer<typeof GrantEffectAction>;
export type GrantItemActionDoc = z.infer<typeof GrantItemAction>;
export type CleanseActionDoc = z.infer<typeof CleanseAction>;
export type RerollOnActionDoc = z.infer<typeof RerollOnAction>;
export type BestOfTwoActionDoc = z.infer<typeof BestOfTwoAction>;
export type WorstOfTwoActionDoc = z.infer<typeof WorstOfTwoAction>;
export type ResultModifyActionDoc = z.infer<typeof ResultModifyAction>;
export type DirectionActionDoc = z.infer<typeof DirectionAction>;
export type RerollActionDoc = z.infer<typeof RerollAction>;
export type MoveActionDoc = z.infer<typeof MoveAction>;
export type MoveToTargetActionDoc = z.infer<typeof MoveToTargetAction>;
export type SwapPositionsActionDoc = z.infer<typeof SwapPositionsAction>;
export type RollbackLastMoveActionDoc = z.infer<typeof RollbackLastMoveAction>;
export type HalveGapActionDoc = z.infer<typeof HalveGapAction>;
export type RemoveActionDoc = z.infer<typeof RemoveAction>;
export type StealItemActionDoc = z.infer<typeof StealItemAction>;
export type TransferItemActionDoc = z.infer<typeof TransferItemAction>;
export type SwapItemsActionDoc = z.infer<typeof SwapItemsAction>;
export type CopyItemActionDoc = z.infer<typeof CopyItemAction>;
export type GrantChosenActionDoc = z.infer<typeof GrantChosenAction>;
export type ExtraSpinActionDoc = z.infer<typeof ExtraSpinAction>;
export type BlockActionDoc = z.infer<typeof BlockAction>;
export type ReflectActionDoc = z.infer<typeof ReflectAction>;
export type AmplifyActionDoc = z.infer<typeof AmplifyAction>;
export type ReplaceActionDoc = z.infer<typeof ReplaceAction>;
export type UntargetableActionDoc = z.infer<typeof UntargetableAction>;
export type ForbidItemsActionDoc = z.infer<typeof ForbidItemsAction>;
export type PierceActionDoc = z.infer<typeof PierceAction>;
export type VictimChoiceActionDoc = z.infer<typeof VictimChoiceAction>;
export type HoldLimitActionDoc = z.infer<typeof HoldLimitAction>;
export type PoolExcludeActionDoc = z.infer<typeof PoolExcludeAction>;
export type PoolRequireActionDoc = z.infer<typeof PoolRequireAction>;
export type PoolFavorActionDoc = z.infer<typeof PoolFavorAction>;
export type ChooseOfNActionDoc = z.infer<typeof ChooseOfNAction>;
export type RerollGameActionDoc = z.infer<typeof RerollGameAction>;
export type PostponeGameActionDoc = z.infer<typeof PostponeGameAction>;
export type AddConditionActionDoc = z.infer<typeof AddConditionAction>;
export type ConditionImmunityActionDoc = z.infer<typeof ConditionImmunityAction>;
export type PlaceObjectActionDoc = z.infer<typeof PlaceObjectAction>;
export type StopMoveActionDoc = z.infer<typeof StopMoveAction>;
export type PushActionDoc = z.infer<typeof PushAction>;
export type ExtendActionDoc = z.infer<typeof ExtendAction>;
export type SpinInsteadActionDoc = z.infer<typeof SpinInsteadAction>;
export type TakeEntryActionDoc = z.infer<typeof TakeEntryAction>;
/** The games an exclusion or a requirement names (wave C, spec §6.16). */
export type PoolMatchDoc = Pick<PoolExcludeActionDoc, "genres" | "years" | "rating">;
export type ActionDoc =
  | StepsActionDoc
  | DiceActionDoc
  | BalanceActionDoc
  | SkipCellEffectActionDoc
  | NoMoveActionDoc
  | GrantEffectActionDoc
  | GrantItemActionDoc
  | CleanseActionDoc
  | RerollOnActionDoc
  | BestOfTwoActionDoc
  | WorstOfTwoActionDoc
  | ResultModifyActionDoc
  | DirectionActionDoc
  | RerollActionDoc
  | MoveActionDoc
  | MoveToTargetActionDoc
  | SwapPositionsActionDoc
  | RollbackLastMoveActionDoc
  | HalveGapActionDoc
  | RemoveActionDoc
  | StealItemActionDoc
  | TransferItemActionDoc
  | SwapItemsActionDoc
  | CopyItemActionDoc
  | GrantChosenActionDoc
  | ExtraSpinActionDoc
  | BlockActionDoc
  | ReflectActionDoc
  | AmplifyActionDoc
  | ReplaceActionDoc
  | UntargetableActionDoc
  | ForbidItemsActionDoc
  | PierceActionDoc
  | VictimChoiceActionDoc
  | HoldLimitActionDoc
  | PoolExcludeActionDoc
  | PoolRequireActionDoc
  | PoolFavorActionDoc
  | ChooseOfNActionDoc
  | RerollGameActionDoc
  | PostponeGameActionDoc
  | AddConditionActionDoc
  | ConditionImmunityActionDoc
  | PlaceObjectActionDoc
  | StopMoveActionDoc
  | PushActionDoc
  | ExtendActionDoc
  | SpinInsteadActionDoc
  | TakeEntryActionDoc;
export type ActionOp = ActionDoc["op"];

/** The answers a rule at `onIncoming` may give — one per rule (spec §6.13). */
export const ANSWER_OPS: readonly ActionOp[] = ["block", "reflect", "amplify", "replace"];

/** "2", "1–3" — the magnitude a range spans. */
function amount(r: ValueRange): { lo: number; hi: number; text: string } {
  const a = Math.abs(r.min);
  const b = Math.abs(r.max);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return { lo, hi, text: lo === hi ? `${lo}` : `${lo}–${hi}` };
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/** "−2…+2" for a range that crosses zero. */
function span(r: ValueRange): string {
  return `${signed(r.min)}…${signed(r.max)}`;
}

type Direction = "up" | "down" | "zero" | "mixed";

function direction(r: ValueRange): Direction {
  if (r.min === 0 && r.max === 0) return "zero";
  if (r.min >= 0) return "up";
  if (r.max <= 0) return "down";
  return "mixed";
}

/** A value's range; a source's, the play model's mean on the turns the rule fires on. */
function rangeOf(v: ValueDoc, env: StaticEnv, play?: PlayContext): ValueRange {
  return valueRange(v, env.params, env.decls, play);
}

function averageMagnitude(r: ValueRange): number {
  return (Math.abs(r.min) + Math.abs(r.max)) / 2;
}

/** The middle of a range, with its sign. */
function averageSigned(r: ValueRange): number {
  return (r.min + r.max) / 2;
}

// --- sources in a sentence (wave A) ------------------------------------------

const SOURCE_BY: Record<
  Locale,
  { diceSum: string; targetLastRoll: string; perItem: (count: string, adj: string) => string; adj: Record<Character, string> }
> = {
  en: {
    diceSum: "the dice result",
    targetLastRoll: "the chosen player's last roll",
    perItem: (count, adj) => `${count} for each ${adj}item you hold`,
    adj: { bonus: "bonus ", penalty: "cursed " },
  },
  ru: {
    diceSum: "сумму кубиков",
    targetLastRoll: "последний бросок выбранного игрока",
    perItem: (count, adj) => `${count} за каждый ваш ${adj}предмет`,
    adj: { bonus: "бонусный ", penalty: "проклятый " },
  },
  uk: {
    diceSum: "суму кубиків",
    targetLastRoll: "останній кидок обраного гравця",
    perItem: (count, adj) => `${count} за кожен ваш ${adj}предмет`,
    adj: { bonus: "бонусний ", penalty: "проклятий " },
  },
};

/** What a source amounts to, after "by" / "на": "the dice result", "1 cell for each item you hold". */
function sourceBy(locale: Locale, source: SourceValueDoc, noun: Noun | null): string {
  const words = SOURCE_BY[locale];
  if (source.source === "itemCount") {
    const m = Math.abs(source.multiplier);
    return words.perItem(noun ? counted(locale, m, m, noun) : `${m}`, source.character ? words.adj[source.character] : "");
  }
  return words[source.source];
}

/** Which way a source pushes a number: the dice and a roll up, a count of items its multiplier's way. */
function sourceUp(source: SourceValueDoc): boolean {
  return source.source !== "itemCount" || source.multiplier > 0;
}

/** What handing an entry out is worth: its own power when known. */
const GRANT_UNKNOWN = 2;
function grantCost(ref: EntryRef, env: StaticEnv): number {
  return env.powerOf?.(ref.entry) ?? GRANT_UNKNOWN;
}

/**
 * A penalty handed to the holder sets them back, a bonus to the chosen player
 * helps them; the other way round it is a gain. An entry it cannot resolve helps.
 */
function grantSign(p: { entry: EntryRef; to: "self" | "target" }, env: StaticEnv): Sign {
  const character = env.resolve(p.entry)?.character;
  if (character === undefined) return 1;
  return (character === "penalty") === (p.to === "self") ? -1 : 1;
}

/** A counted noun after a number: "2 cells", "1–3 клетки". */
function nounAfter(locale: Locale, r: ValueRange, noun: Noun): string {
  const m = amount(r);
  return counted(locale, m.lo, m.hi, noun);
}

const CHARACTER_ADJ: Record<Locale, Record<Character, { all: string; one: string; some: string }>> = {
  en: {
    bonus: { all: "bonus ", one: "bonus ", some: "bonus " },
    penalty: { all: "penalty ", one: "penalty ", some: "penalty " },
  },
  ru: {
    bonus: { all: "бонусные ", one: "бонусный ", some: "бонусных " },
    penalty: { all: "штрафные ", one: "штрафной ", some: "штрафных " },
  },
  uk: {
    bonus: { all: "бонусні ", one: "бонусний ", some: "бонусних " },
    penalty: { all: "штрафні ", one: "штрафний ", some: "штрафних " },
  },
};

function tagSuffix(locale: Locale, tags: readonly string[] | undefined): string {
  if (!tags || tags.length === 0) return "";
  const list = joinOr(
    locale,
    tags.map((t) => quote(locale, t)),
  );
  if (locale === "en") return ` tagged ${list}`;
  if (locale === "ru") return ` с меткой ${list}`;
  return ` з міткою ${list}`;
}

function grantHarm(p: { entry: EntryRef; to: "self" | "target" }, env: StaticEnv): Harm {
  if (p.to !== "target") return "none";
  // A gift is not an attack; anything else aimed at a rival is (D9).
  return env.resolve(p.entry)?.character === "bonus" ? "none" : "target";
}

function recipient(to: "self" | "target", ctx: RuleContext): string | null {
  if (to === "self") return ctx.self.seasonPlayerId;
  return ctx.target?.seasonPlayerId ?? null;
}

function reasonFor(env: RunEnv): string {
  return `${env.entry.kind}:${env.entry.slug}`;
}

function grantInto(
  p: GrantEffectActionDoc | GrantItemActionDoc,
  entryKind: EntryKind,
  ctx: RuleContext,
  env: RunEnv,
  out: RuleOutput,
): void {
  const to = recipient(p.to, ctx);
  const facts = env.resolve(p.entry);
  // A missing recipient or a dangling reference is caught by the checks before
  // play; at run time it is skipped rather than allowed to fail a turn.
  if (to === null || facts === null) return;
  // An effect its user keeps remembers whom the item was aimed at («Магнит», spec §6.11)…
  const kept = entryKind === "effect" && to === ctx.self.seasonPlayerId;
  const aimed = kept && ctx.target !== null && ctx.target.seasonPlayerId !== to;
  // …and what the use picked for the next game (wave C, spec §6.16).
  const chosen = kept && ctx.pick ? ctx.pick : null;
  out.intents.push({
    kind: "grant",
    entryId: facts.entryId,
    key: facts.slug,
    entryKind,
    to,
    ...(aimed ? { aimedAt: ctx.target!.seasonPlayerId } : {}),
    ...(chosen ? { chosen } : {}),
  });
}

const meanOf = (dist: readonly number[]) => expectedValue(dist, (sum) => sum);

/**
 * What changing the dice result is worth to the holder (spec §14): a pass
 * moves forward by its result, a drop back by its own — so a higher result
 * helps a pass and hurts a drop. `after` maps a throw's sum distribution to
 * the expected result once the primitive has acted, measured in the
 * direction the move would have gone; the cost is how far that is from an
 * ordinary throw, on the passes and drops the rule fires on.
 */
/**
 * What staying put is worth: a pass's move forward is lost, a drop's move
 * back is spared — the throws the rule fires on, with the dice they use.
 */
function noMoveWorth(play: PlayContext): number {
  const dice = playDice(play);
  const w = outcomeWeights(play);
  const held = (shape: DiceShape) => meanOf(keptDistribution(throwDistribution(shape), play.sum));
  return w.drop * held(dice.drop) - w.pass * held(dice.pass);
}

/**
 * What more (or fewer) dice and sides are worth: a die more moves a pass
 * forward by its mean and a drop back by as much; a side more adds half a cell
 * to every die thrown — two on a drop.
 */
function diceWorth(p: DiceActionDoc, env: StaticEnv, play: PlayContext): number {
  const count = p.count === undefined ? 0 : averageSigned(rangeOf(p.count, env));
  const sides = p.sides === undefined ? 0 : averageSigned(rangeOf(p.sides, env));
  const { dieMean, passDice, dropDice } = PLAY_MODEL;
  const onPass = count * dieMean + (sides / 2) * (passDice + count);
  const onDrop = count * dieMean + (sides / 2) * (dropDice + count);
  const w = outcomeWeights(play);
  return w.pass * onPass - w.drop * onDrop;
}

function dicePipelineWorth(play: PlayContext, after: PipelineAfter): number {
  const dice = playDice(play);
  // The throws the rule fires on: all of them, or those its sum condition lets through.
  const pass = keptDistribution(throwDistribution(dice.pass), play.sum);
  const drop = keptDistribution(throwDistribution(dice.drop), play.sum);
  const w = outcomeWeights(play);
  const onPass = after(pass, "passed", dice.pass) - meanOf(pass);
  // A drop's longer result is a longer move back: it counts against the holder.
  const onDrop = after(drop, "dropped", dice.drop) - meanOf(drop);
  return w.pass * onPass - w.drop * onDrop;
}

/** A throw's expected result once a primitive has acted, from its sum distribution and the dice that made it. */
type PipelineAfter = (dist: readonly number[], outcome: "passed" | "dropped", dice: DiceShape) => number;

/** A dice-pipeline primitive's cost and way (spec §14), from what it does to a throw. */
function dicePipeline<P>(after: (p: P, env: StaticEnv, play: PlayContext) => PipelineAfter) {
  return {
    cost: (p: P, env: StaticEnv, play: PlayContext) => Math.abs(dicePipelineWorth(play, after(p, env, play))),
    sign: (p: P, env: StaticEnv, play: PlayContext) => signOf(dicePipelineWorth(play, after(p, env, play))),
  };
}

/**
 * A dice primitive that may also stand at a reaction item's `onUse` (wave B,
 * spec §6.15): there it is worth what one use gains on the bad throw it is
 * used on — averaged over what a `random` value may be — and it always helps,
 * since a player uses it only when it does; elsewhere, its pipeline worth.
 */
function reactable<P>(
  pipeline: { cost(p: P, env: StaticEnv, play: PlayContext): number; sign(p: P, env: StaticEnv, play: PlayContext): Sign },
  rules: (p: P, env: StaticEnv, play: PlayContext) => ReactionRules[],
) {
  return {
    cost: (p: P, env: StaticEnv, play: PlayContext) => {
      if (!play.reaction) return pipeline.cost(p, env, play);
      const each = rules(p, env, play);
      return each.reduce((acc, r) => acc + reactionWorth(r, play), 0) / Math.max(1, each.length);
    },
    sign: (p: P, env: StaticEnv, play: PlayContext): Sign => (play.reaction ? 1 : pipeline.sign(p, env, play)),
  };
}

/** The integers a range spans — for averaging a cost over a `random` value. */
function spanValues(r: ValueRange): number[] {
  if (r.max - r.min > 40) return [Math.round((r.min + r.max) / 2)];
  return Array.from({ length: r.max - r.min + 1 }, (_, i) => r.min + i);
}

const REROLL_WORDS: Record<Locale, (faces: string, many: boolean) => string> = {
  en: (faces) => `a die showing ${faces} is thrown again once`,
  ru: (faces) => `кубик, на котором выпало ${faces}, перебрасывается один раз`,
  uk: (faces) => `кубик, на якому випало ${faces}, перекидається один раз`,
};

function resultClause(locale: Locale, p: ResultModifyActionDoc, env: TextEnv): string {
  const parts: string[] = [];
  let floor = false;
  if (p.delta !== undefined && isSourceValue(p.delta)) {
    // "1 lower for each item you hold": a source reads as what it counts.
    const up = sourceUp(p.delta);
    const by = sourceBy(locale, p.delta, null);
    floor = !up;
    parts.push(
      locale === "en" ? `${up ? "higher" : "lower"} by ${by}` : locale === "ru" ? `${up ? "больше" : "меньше"} на ${by}` : `${up ? "більший" : "менший"} на ${by}`,
    );
  } else if (p.delta !== undefined) {
    const r = rangeOf(p.delta, env);
    const m = amount(r);
    switch (direction(r)) {
      case "up":
        parts.push(locale === "en" ? `${m.text} higher` : locale === "ru" ? `на ${m.text} больше` : `на ${m.text} більший`);
        break;
      case "down":
        floor = true;
        parts.push(locale === "en" ? `${m.text} lower` : locale === "ru" ? `на ${m.text} меньше` : `на ${m.text} менший`);
        break;
      case "zero":
        break;
      default:
        floor = true;
        parts.push(locale === "en" ? `changed by ${span(r)}` : locale === "ru" ? `меняется на ${span(r)}` : `змінюється на ${span(r)}`);
    }
  }
  if (p.cap !== undefined) {
    const cap = valueRange(p.cap, env.params, env.decls).max;
    parts.push(locale === "en" ? `at most ${cap}` : locale === "ru" ? `не больше ${cap}` : `не більший за ${cap}`);
  }
  const head = locale === "en" ? "the dice result is " : locale === "ru" ? "результат кубиков " : "результат кубиків ";
  const and = locale === "en" ? " and " : locale === "ru" ? " и " : " і ";
  const tail = floor ? (locale === "en" ? " (never below 1)" : locale === "ru" ? " (не меньше 1)" : " (не менше 1)") : "";
  if (parts.length === 0) {
    return locale === "en" ? "the dice result is unchanged" : locale === "ru" ? "результат кубиков не меняется" : "результат кубиків не змінюється";
  }
  return `${head}${parts.join(and)}${tail}`;
}

// --- out-of-turn moves -----------------------------------------------------

/** Who a rule's out-of-turn move is about, from where it runs. */
function mover(who: "self" | "target", ctx: RuleContext): string | null {
  return who === "self" ? ctx.self.seasonPlayerId : (ctx.target?.seasonPlayerId ?? null);
}

const INSTANT: Record<Locale, { self: string; target: string }> = {
  en: { self: "you instantly move", target: "the chosen player instantly moves" },
  ru: { self: "вы мгновенно перемещаетесь", target: "выбранный игрок мгновенно перемещается" },
  uk: { self: "ви миттєво переміщуєтеся", target: "обраний гравець миттєво переміщується" },
};

const WAY: Record<Locale, { forward: string; back: string; stay: string }> = {
  en: { forward: "forward", back: "back", stay: "stay put" },
  ru: { forward: "вперёд", back: "назад", stay: "на месте" },
  uk: { forward: "уперед", back: "назад", stay: "на місці" },
};

/** "1 → 5 back, 2–5 → 2 back, …" — what each face of a table moves. */
function tableRows(locale: Locale, table: TableValueDoc["table"]): string {
  return tableShares(table)
    .map((row) => {
      const faces = row.from === row.upTo ? `${row.upTo}` : `${row.from}–${row.upTo}`;
      const way = row.value === 0 ? WAY[locale].stay : `${locale === "en" ? "" : "на "}${Math.abs(row.value)} ${row.value > 0 ? WAY[locale].forward : WAY[locale].back}`;
      return locale === "en" ? `${faces} → ${way}` : `${faces} — ${way}`;
    })
    .join(", ");
}

function moveText(locale: Locale, p: MoveActionDoc, env: TextEnv): string {
  const head = INSTANT[locale][p.who ?? "self"];
  if (isSourceValue(p.by)) {
    // "you instantly move forward by 1 cell for each item you hold"
    const way = sourceUp(p.by) ? WAY[locale].forward : WAY[locale].back;
    return `${head} ${way} ${locale === "en" ? "by" : "на"} ${sourceBy(locale, p.by, NOUNS.cell)}`;
  }
  if (isTableValue(p.by)) {
    const roll = locale === "en" ? `by a d${p.by.table.die} roll` : locale === "ru" ? `по броску d${p.by.table.die}` : `за кидком d${p.by.table.die}`;
    return `${head} ${roll}: ${tableRows(locale, p.by.table)}`;
  }
  const r = rangeOf(p.by, env);
  const cells = nounAfter(locale, r, NOUNS.cell);
  const on = locale === "en" ? "" : "на ";
  switch (direction(r)) {
    case "up":
      return `${head} ${on}${cells} ${WAY[locale].forward}`;
    case "down":
      return `${head} ${on}${cells} ${WAY[locale].back}`;
    case "zero":
      return locale === "en" ? `${head} nowhere` : locale === "ru" ? `${head} на месте` : `${head} на місці`;
    default:
      return `${head} ${on}${span(r)} ${plural(locale, amount(r).hi, NOUNS.cell)}`;
  }
}

/** A removal's words in Russian and Ukrainian, by the number's form (one, few, many). */
type Forms = readonly [one: string, few: string, many: string];
const SLAVIC_REMOVE: Record<"ru" | "uk", {
  noun: Record<"effect" | "item", Forms>;
  adj: Record<"bonus" | "penaltyEffect" | "penaltyItem" | "random" | "newest" | "your", Forms>;
  or: string;
  verb: string;
  chosen: string;
  pickOne: string;
}> = {
  ru: {
    noun: { effect: ["эффект", "эффекта", "эффектов"], item: ["предмет", "предмета", "предметов"] },
    adj: {
      bonus: ["бонусный", "бонусных", "бонусных"],
      penaltyEffect: ["штрафной", "штрафных", "штрафных"],
      penaltyItem: ["проклятый", "проклятых", "проклятых"],
      random: ["случайный", "случайных", "случайных"],
      newest: ["самый новый", "самых новых", "самых новых"],
      your: ["ваш", "ваших", "ваших"],
    },
    or: " или ",
    verb: "снимает",
    chosen: "выбранного игрока",
    pickOne: "на ваш выбор один ваш",
  },
  uk: {
    noun: { effect: ["ефект", "ефекти", "ефектів"], item: ["предмет", "предмети", "предметів"] },
    adj: {
      bonus: ["бонусний", "бонусні", "бонусних"],
      penaltyEffect: ["штрафний", "штрафні", "штрафних"],
      penaltyItem: ["проклятий", "прокляті", "проклятих"],
      random: ["випадковий", "випадкові", "випадкових"],
      newest: ["найновіший", "найновіші", "найновіших"],
      your: ["ваш", "ваші", "ваших"],
    },
    or: " або ",
    verb: "знімає",
    chosen: "обраного гравця",
    pickOne: "на ваш вибір один ваш",
  },
};

/** English nouns of a removal: one, and several. */
const EN_REMOVE: Record<"effect" | "item", Record<"any" | Character, { one: string; many: string }>> = {
  effect: {
    any: { one: "effect", many: "effects" },
    bonus: { one: "bonus effect", many: "bonus effects" },
    penalty: { one: "penalty effect", many: "penalty effects" },
  },
  item: {
    any: { one: "item", many: "items" },
    bonus: { one: "bonus item", many: "bonus items" },
    // A penalty item is a cursed item (D3).
    penalty: { one: "cursed item", many: "cursed items" },
  },
};

/** The CLDR form a Russian or Ukrainian number takes: one, few, many. */
function slavicIndex(n: number): 0 | 1 | 2 {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 0;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 1;
  return 2;
}

function removeText(locale: Locale, p: RemoveActionDoc, env: TextEnv): string {
  const count = p.count ?? 1;
  const fromTarget = p.from === "target";
  if (p.entry) {
    const name = quote(locale, refName(p.entry, env));
    if (locale === "en") return `removes ${name} from ${fromTarget ? "the chosen player" : "you"}`;
    if (locale === "ru") return `снимает ${fromTarget ? "с выбранного игрока" : "с вас"} ${name}`;
    return `знімає ${fromTarget ? "з обраного гравця" : "з вас"} ${name}`;
  }
  const kinds = p.what === "any" ? (["effect", "item"] as const) : ([p.what] as const);
  if (locale === "en") {
    const rare = rarityWords("en", p.rarity);
    const forms = kinds.map((k) => EN_REMOVE[k][p.character ?? "any"]);
    const one = forms.map((f) => `${rare}${f.one}`).join(" or ");
    const many = forms.map((f) => `${rare}${f.many}`).join(" or ");
    const whose = fromTarget ? "the chosen player's" : "your";
    const ofWhom = fromTarget ? "the chosen player's" : "yours";
    if (p.pick === "choice") return `removes one of your ${many} of your choice`;
    if (p.pick === "newest") return count === 1 ? `removes ${whose} newest ${one}` : `removes ${whose} ${count} newest ${many}`;
    return count === 1 ? `removes a random ${one} of ${ofWhom}` : `removes ${count} random ${many} of ${ofWhom}`;
  }
  const w = SLAVIC_REMOVE[locale];
  // "штрафной эффект или проклятый предмет", agreeing with the number.
  const phrase = (f: 0 | 1 | 2) =>
    kinds
      .map((k) => {
        const adj =
          p.character === "bonus" ? w.adj.bonus[f] : p.character === "penalty" ? (k === "item" ? w.adj.penaltyItem : w.adj.penaltyEffect)[f] : null;
        return `${rarityWords(locale, p.rarity, f)}${adj ? `${adj} ` : ""}${w.noun[k][f]}`;
      })
      .join(w.or);
  if (p.pick === "choice") return `${w.verb} ${w.pickOne} ${phrase(0)}`;
  const f = slavicIndex(count);
  const which = (p.pick === "newest" ? w.adj.newest : w.adj.random)[f];
  const number = count === 1 ? "" : `${count} `;
  return fromTarget
    ? `${w.verb} ${number}${which} ${phrase(f)} ${w.chosen}`
    : `${w.verb} ${number}${which} ${w.adj.your[f]} ${phrase(f)}`;
}

// --- item operations in a sentence (wave B, spec §6.12) -----------------------

/** Rarity words in Russian and Ukrainian: by the number's form, and the dative and genitive of one. */
const SLAVIC_RARITY: Record<"ru" | "uk", Record<Rarity, { forms: Forms; dat: string; gen: string }>> = {
  ru: {
    common: { forms: ["обычный", "обычных", "обычных"], dat: "обычному", gen: "обычного" },
    rare: { forms: ["редкий", "редких", "редких"], dat: "редкому", gen: "редкого" },
    epic: { forms: ["эпический", "эпических", "эпических"], dat: "эпическому", gen: "эпического" },
    legendary: { forms: ["легендарный", "легендарных", "легендарных"], dat: "легендарному", gen: "легендарного" },
  },
  uk: {
    common: { forms: ["звичайний", "звичайні", "звичайних"], dat: "звичайному", gen: "звичайного" },
    rare: { forms: ["рідкісний", "рідкісні", "рідкісних"], dat: "рідкісному", gen: "рідкісного" },
    epic: { forms: ["епічний", "епічні", "епічних"], dat: "епічному", gen: "епічного" },
    legendary: { forms: ["легендарний", "легендарні", "легендарних"], dat: "легендарному", gen: "легендарного" },
  },
};

const OR_WORD: Record<Locale, string> = { en: " or ", ru: " или ", uk: " або " };

/** "common or rare " — the rarities a filter lets through, before a noun; nothing without one. */
function rarityWords(locale: Locale, rarity: readonly Rarity[] | undefined, form: 0 | 1 | 2 | "dat" | "gen" = 0): string {
  if (!rarity || rarity.length === 0) return "";
  const words = rarity.map((r) => {
    if (locale === "en") return r;
    const w = SLAVIC_RARITY[locale][r];
    return form === "dat" ? w.dat : form === "gen" ? w.gen : w.forms[form];
  });
  return `${words.join(OR_WORD[locale])} `;
}

const SLAVIC_ITEMS: Record<"ru" | "uk", { random: Forms; your: Forms; bonus: Forms; noun: Forms }> = {
  ru: {
    random: ["случайный", "случайных", "случайных"],
    your: ["ваш", "ваших", "ваших"],
    bonus: ["бонусный", "бонусных", "бонусных"],
    noun: ["предмет", "предмета", "предметов"],
  },
  uk: {
    random: ["випадковий", "випадкові", "випадкових"],
    your: ["ваш", "ваші", "ваших"],
    bonus: ["бонусний", "бонусні", "бонусних"],
    noun: ["предмет", "предмети", "предметів"],
  },
};

/** "a random bonus item", "2 random common bonus items of yours" — what an item operation moves. */
function randomItems(locale: Locale, count: number, rarity: readonly Rarity[] | undefined, yours: boolean): string {
  if (locale === "en") {
    const rare = rarityWords("en", rarity);
    const head = count === 1 ? `a random ${rare}bonus item` : `${count} random ${rare}bonus items`;
    return yours ? `${head} of yours` : head;
  }
  const w = SLAVIC_ITEMS[locale];
  const f = slavicIndex(count);
  const number = count === 1 ? "" : `${count} `;
  const your = yours ? `${w.your[f]} ` : "";
  return `${number}${w.random[f]} ${your}${rarityWords(locale, rarity, f)}${w.bonus[f]} ${w.noun[f]}`;
}

function transferText(locale: Locale, p: TransferItemActionDoc): string {
  const count = p.count ?? 1;
  const items = randomItems(locale, count, p.rarity, true);
  const toTarget = p.to === "target";
  if (locale === "en") return `${items} ${count === 1 ? "goes" : "go"} to ${toTarget ? "the chosen player" : "a random rival"}`;
  if (locale === "ru") return `${items} ${count === 1 ? "переходит" : "переходят"} ${toTarget ? "к выбранному игроку" : "к случайному сопернику"}`;
  return `${items} ${count === 1 ? "переходить" : "переходять"} ${toTarget ? "до обраного гравця" : "до випадкового суперника"}`;
}

const ACTIVATION_ADJ: Record<Locale, Record<"active" | "passive", string>> = {
  en: { active: "active", passive: "passive" },
  ru: { active: "активный", passive: "пассивный" },
  uk: { active: "активний", passive: "пасивний" },
};

function chosenText(locale: Locale, p: GrantChosenActionDoc): string {
  const what = `${rarityWords(locale, p.rarity)}${p.activation ? `${ACTIVATION_ADJ[locale][p.activation]} ` : ""}`;
  if (locale === "en") {
    const phrase = `${what}bonus item`;
    return `you get ${/^[aeiou]/.test(phrase) ? "an" : "a"} ${phrase} of your choice from the season's catalog`;
  }
  if (locale === "ru") return `вы получаете ${what}бонусный предмет на ваш выбор из каталога сезона`;
  return `ви отримуєте ${what}бонусний предмет на ваш вибір з каталогу сезону`;
}

// --- what arrives, and protection (wave B, spec §6.13) ------------------------

/** What arrives is worth to its holder, as the rule's `incoming` condition narrows it: a bonus up, the rest down. */
function arrivalWorth(play: PlayContext): number {
  return arrivalOf(play.incoming ?? null).worth;
}

/** Times a number goes: "twice", "three times". */
const TIMES: Record<Locale, Record<2 | 3, string>> = {
  en: { 2: "twice", 3: "three times" },
  ru: { 2: "дважды", 3: "трижды" },
  uk: { 2: "двічі", 3: "тричі" },
};

function replaceText(locale: Locale, p: ReplaceActionDoc): string {
  if (p.with === 0) {
    return locale === "en" ? "instead you stay where you are" : locale === "ru" ? "вместо этого вы остаётесь на месте" : "натомість ви лишаєтеся на місці";
  }
  const cells = counted(locale, p.with, p.with, NOUNS.cell);
  if (locale === "en") return `instead you move ${cells} forward`;
  if (locale === "ru") return `вместо этого вы перемещаетесь на ${cells} вперёд`;
  return `натомість ви переміщуєтеся на ${cells} уперед`;
}

function pierceText(locale: Locale, p: PierceActionDoc): string {
  if (locale === "en") return `harmful actions aimed at you pierce ${p.value === 1 ? "ordinary" : "any"} protection`;
  if (locale === "ru") return `вредные действия против вас пробивают ${p.value === 1 ? "обычную" : "любую"} защиту`;
  return `шкідливі дії проти вас пробивають ${p.value === 1 ? "звичайний" : "будь-який"} захист`;
}

// --- the player's choices (wave B, spec §6.14) --------------------------------

/** "a bonus item", "2 bonus items" — what a choice is made among. */
function bonusItems(locale: Locale, count: number, form: "plain" | "gen" = "plain"): string {
  if (locale === "en") return count === 1 ? "a bonus item" : `${count} bonus items`;
  if (form === "gen") {
    // "не больше 1 бонусного предмета", "не больше 2 бонусных предметов"
    const gen = locale === "ru" ? (count === 1 ? "бонусного предмета" : "бонусных предметов") : count === 1 ? "бонусного предмета" : "бонусних предметів";
    return `${count} ${gen}`;
  }
  const w = SLAVIC_ITEMS[locale];
  const f = slavicIndex(count);
  return `${count === 1 ? "" : `${count} `}${w.bonus[f]} ${w.noun[f]}`;
}

function victimChoiceText(locale: Locale, p: VictimChoiceActionDoc): string {
  const items = bonusItems(locale, p.count ?? 1);
  if (locale === "en") {
    return p.orKeep ? `you may discard ${items} of your choice to be rid of it` : `you discard ${items} of your choice`;
  }
  if (locale === "ru") {
    return p.orKeep ? `вы можете сбросить ${items} на ваш выбор, чтобы избавиться от него` : `вы сбрасываете ${items} на ваш выбор`;
  }
  return p.orKeep ? `ви можете скинути ${items} на ваш вибір, щоб позбутися його` : `ви скидаєте ${items} на ваш вибір`;
}

function holdLimitText(locale: Locale, p: HoldLimitActionDoc): string {
  const one = p.max === 1;
  if (locale === "en") {
    const items = p.max === 1 ? "1 bonus item" : `${p.max} bonus items`;
    return `you may hold at most ${items}: when you hold more, you choose which ${one ? "one" : "ones"} to keep and the rest burn`;
  }
  const items = bonusItems(locale, p.max, "gen");
  if (locale === "ru") {
    return `у вас может быть не больше ${items}: когда их больше, вы выбираете, ${one ? "какой" : "какие"} оставить, а остальные сгорают`;
  }
  return `у вас може бути не більше ${items}: коли їх більше, ви обираєте, ${one ? "який" : "які"} залишити, а решта згорає`;
}

// --- the next game (wave C, spec §6.16) ----------------------------------------

/** What a genre set reads where the rule runs — lowercase, each once; null when it reads nothing. */
function readGenres(set: NonNullable<PoolMatchDoc["genres"]>, ctx: RuleContext): string[] | null {
  let genres: readonly string[] | null;
  if (Array.isArray(set)) genres = set;
  else if (set === "picked") genres = ctx.chosen && "genre" in ctx.chosen ? [ctx.chosen.genre] : null;
  else if (set === "lastPassed") genres = ctx.games?.lastPassed ?? null;
  else genres = ctx.games?.passed ?? null;
  return genres && genres.length > 0 ? [...new Set(genres.map((g) => g.toLowerCase()))] : null;
}

/** What a span of years reads: the one the use picked, or its bounds; null when nothing was picked. */
function readYears(span: NonNullable<PoolMatchDoc["years"]>, ctx: RuleContext, env: RunEnv): GameMatch["years"] | null {
  if (span === "picked") return ctx.chosen && "years" in ctx.chosen ? { min: ctx.chosen.years[0], max: ctx.chosen.years[1] } : null;
  return {
    min: span.min === undefined ? null : runValue(span.min, ctx, env),
    max: span.max === undefined ? null : runValue(span.max, ctx, env),
  };
}

/**
 * The games an exclusion or a requirement names, as the moment reads them
 * (spec §6.16). Null when one of its sets reads nothing — no pick remembered,
 * no game passed yet: such a rule matches no game, so an exclusion leaves the
 * pool as it is and a requirement is dropped.
 */
function readMatch(p: PoolMatchDoc, ctx: RuleContext, env: RunEnv): GameMatch | null {
  const match: GameMatch = {};
  if (p.genres !== undefined) {
    const genres = readGenres(p.genres, ctx);
    if (!genres) return null;
    match.genres = genres;
  }
  if (p.years !== undefined) {
    const years = readYears(p.years, ctx, env);
    if (!years) return null;
    match.years = years;
  }
  if (p.rating !== undefined) match.rating = { min: p.rating.min ?? null, max: p.rating.max ?? null };
  return match;
}

/** The parameters a span of years reads. */
function poolParams(p: PoolMatchDoc): string[] {
  if (p.years === undefined || p.years === "picked") return [];
  return [...(p.years.min === undefined ? [] : valueParams(p.years.min)), ...(p.years.max === undefined ? [] : valueParams(p.years.max))];
}

/**
 * How far an exclusion or a requirement moves the holder's chance to pass the
 * game they get (spec §6.16, `PLAY_MODEL.pool`): what they picked up, what
 * they did not down.
 */
function poolShift(p: PoolMatchDoc, how: "exclude" | "require"): number {
  const { picked, imposed } = PLAY_MODEL.pool;
  let shift = 0;
  if (p.genres !== undefined) shift += p.genres === "picked" ? picked[how].genre : imposed.genres;
  if (p.years !== undefined) shift += p.years === "picked" ? picked[how].years : imposed.years;
  if (p.rating !== undefined) shift += imposed.rating;
  return shift;
}

/** A pass instead of a drop, in cells, times the chance a rule moves. */
const poolWorth = (shift: number) => shift * PLAY_MODEL.gameSwing;

/** A rating as the catalog writes it: "4", "3.5" — "3,5" in ru and uk. */
function ratingText(locale: Locale, n: number): string {
  const text = Number.isInteger(n) ? `${n}` : n.toFixed(1);
  return locale === "en" ? text : text.replace(".", ",");
}

const GAMES_WORDS: Record<
  Locale,
  {
    games: string;
    genre: (list: string) => string;
    genres: (list: string) => string;
    sets: Record<(typeof GENRE_SETS)[number], string>;
    pickedYears: string;
    years: { both: (a: number, b: number) => string; from: (a: number) => string; upTo: (b: number) => string };
    rating: { both: (a: string, b: string) => string; from: (a: string) => string; upTo: (b: string) => string };
  }
> = {
  en: {
    games: "games",
    genre: (list) => `of the genre ${list}`,
    genres: (list) => `of the genres ${list}`,
    sets: {
      picked: "of the genre you picked",
      lastPassed: "sharing a genre with the last game you passed",
      passed: "of a genre you have passed a game in this season",
    },
    pickedYears: "from the years you picked",
    years: { both: (a, b) => `released in ${a}–${b}`, from: (a) => `released in ${a} or later`, upTo: (b) => `released in ${b} or earlier` },
    rating: { both: (a, b) => `rated ${a}–${b}`, from: (a) => `rated ${a} or higher`, upTo: (b) => `rated ${b} or lower` },
  },
  ru: {
    games: "игры",
    genre: (list) => `жанра ${list}`,
    genres: (list) => `жанров ${list}`,
    sets: {
      picked: "выбранного вами жанра",
      lastPassed: "тех же жанров, что и последняя пройденная вами игра",
      passed: "жанров, в которых вы уже прошли игру в этом сезоне",
    },
    pickedYears: "выбранных вами лет выпуска",
    years: {
      both: (a, b) => `вышедшие в ${a}–${b} годах`,
      from: (a) => `вышедшие в ${a} году или позже`,
      upTo: (b) => `вышедшие в ${b} году или раньше`,
    },
    rating: { both: (a, b) => `с рейтингом от ${a} до ${b}`, from: (a) => `с рейтингом от ${a}`, upTo: (b) => `с рейтингом до ${b}` },
  },
  uk: {
    games: "ігри",
    genre: (list) => `жанру ${list}`,
    genres: (list) => `жанрів ${list}`,
    sets: {
      picked: "обраного вами жанру",
      lastPassed: "тих самих жанрів, що й остання пройдена вами гра",
      passed: "жанрів, у яких ви вже пройшли гру цього сезону",
    },
    pickedYears: "обраних вами років випуску",
    years: {
      both: (a, b) => `що вийшли в ${a}–${b} роках`,
      from: (a) => `що вийшли в ${a} році або пізніше`,
      upTo: (b) => `що вийшли в ${b} році або раніше`,
    },
    rating: { both: (a, b) => `з рейтингом від ${a} до ${b}`, from: (a) => `з рейтингом від ${a}`, upTo: (b) => `з рейтингом до ${b}` },
  },
};

/**
 * "games of the genre «horror» released in 2009 or earlier" — what an
 * exclusion or a requirement names. In ru and uk a span of years is a
 * participle phrase: commas set it off.
 */
function gamesPhrase(locale: Locale, p: PoolMatchDoc, env: TextEnv): string {
  const words = GAMES_WORDS[locale];
  let out = words.games;
  if (p.genres !== undefined) {
    if (Array.isArray(p.genres)) {
      const list = joinOr(
        locale,
        p.genres.map((g) => quote(locale, g)),
      );
      out += ` ${p.genres.length === 1 ? words.genre(list) : words.genres(list)}`;
    } else {
      out += ` ${words.sets[p.genres as (typeof GENRE_SETS)[number]]}`;
    }
  }
  let participle = false;
  if (p.years === "picked") out += ` ${words.pickedYears}`;
  else if (p.years !== undefined) {
    const min = p.years.min === undefined ? null : percentOf(p.years.min, env);
    const max = p.years.max === undefined ? null : percentOf(p.years.max, env);
    const span = min !== null && max !== null ? words.years.both(min, max) : min !== null ? words.years.from(min) : words.years.upTo(max!);
    participle = locale !== "en";
    out += participle ? `, ${span}` : ` ${span}`;
  }
  if (p.rating !== undefined) {
    const min = p.rating.min === undefined ? null : ratingText(locale, p.rating.min);
    const max = p.rating.max === undefined ? null : ratingText(locale, p.rating.max);
    const rated = min !== null && max !== null ? words.rating.both(min, max) : min !== null ? words.rating.from(min) : words.rating.upTo(max!);
    if (locale === "en") out += p.years !== undefined ? ` and ${rated}` : ` ${rated}`;
    else out += participle ? `, ${rated}` : ` ${rated}`;
  }
  return out;
}

function excludeText(locale: Locale, p: PoolMatchDoc, env: TextEnv): string {
  const games = gamesPhrase(locale, p, env);
  if (locale === "en") return `${games} cannot come up`;
  return locale === "ru" ? `не выпадают ${games}` : `не випадають ${games}`;
}

function requireText(locale: Locale, p: PoolMatchDoc, env: TextEnv): string {
  const games = gamesPhrase(locale, p, env);
  if (locale === "en") return `only ${games} can come up`;
  return locale === "ru" ? `выпадают только ${games}` : `випадають лише ${games}`;
}

const AS_LIKELY: Record<2 | 3 | 4 | 5, string> = { 2: "twice", 3: "three times", 4: "four times", 5: "five times" };

function favorText(locale: Locale, p: PoolFavorActionDoc): string {
  const n = p.factor;
  if (locale === "en") return `the game you picked is ${AS_LIKELY[n as 2 | 3 | 4 | 5]} as likely to come up`;
  if (locale === "ru") return `выбранная вами игра выпадает в ${n} ${n < 5 ? "раза" : "раз"} чаще`;
  return `обрана вами гра випадає в ${n} ${n < 5 ? "рази" : "разів"} частіше`;
}

/** "the draw offers 3 games and you take one" (spec §7.12). */
function chooseText(locale: Locale, p: ChooseOfNActionDoc): string {
  const n = p.n;
  if (locale === "en") return `the draw offers ${n} games and you take one`;
  if (locale === "ru") return `выпадают ${n} ${n < 5 ? "игры" : "игр"} на выбор — вы берёте одну`;
  return `випадають ${n} ${n < 5 ? "гри" : "ігор"} на вибір — ви берете одну`;
}

/** What an item used on an open roll does to the game in flight (spec §6.16). */
function rerollGameText(locale: Locale): string {
  if (locale === "en") return "your game in progress is replaced by a new one, without a judge and without spending the season's rerolls";
  if (locale === "ru") return "ваша текущая игра заменяется новой — без судьи и без траты рероллов сезона";
  return "ваша поточна гра замінюється новою — без судді й без витрати реролів сезону";
}

function postponeGameText(locale: Locale, p: PostponeGameActionDoc): string {
  const n = p.afterRolls ?? AFTER_ROLLS.default;
  if (locale === "en") return `your game in progress is set aside and comes back as your game ${n} rolls later; a new game is picked now`;
  if (locale === "ru") return `ваша текущая игра откладывается и вернётся к вам через ${n} броска; сейчас выбирается новая игра`;
  return `ваша поточна гра відкладається й повернеться до вас через ${n} кидки; зараз обирається нова гра`;
}

/** "the player who entered is thrown 2 cells back" — what an object does after it stops a move (spec §6.18). */
function pushText(locale: Locale, p: PushActionDoc, env: TextEnv): string {
  const r = rangeOf(p.delta, env);
  const back = direction(r) === "down";
  const cells = nounAfter(locale, r, NOUNS.cell);
  if (locale === "en") return back ? `the player who entered is thrown ${cells} back` : `the player who entered is moved ${cells} forward`;
  if (locale === "ru") return back ? `вошедшего игрока отбрасывает на ${cells} назад` : `вошедшего игрока переносит на ${cells} вперёд`;
  return back ? `гравця, що увійшов, відкидає на ${cells} назад` : `гравця, що увійшов, переносить на ${cells} вперед`;
}

/** "the move goes 2 cells further" (spec §6.18). */
function extendText(locale: Locale, p: ExtendActionDoc, env: TextEnv): string {
  const cells = nounAfter(locale, rangeOf(p.delta, env), NOUNS.cell);
  if (locale === "en") return `the move goes ${cells} further`;
  if (locale === "ru") return `ход продолжается ещё на ${cells}`;
  return `хід триває ще на ${cells}`;
}

/** A completion condition (spec §6.17): the game's — "the game gets a completion condition: “…”". */
function addConditionText(locale: Locale, p: AddConditionActionDoc): string {
  const text = quote(locale, localizedIn(p.text, locale));
  if (locale === "en") return `the game gets a completion condition: ${text}`;
  if (locale === "ru") return `игре добавляется условие прохождения: ${text}`;
  return `грі додається умова проходження: ${text}`;
}

function conditionImmunityText(locale: Locale): string {
  if (locale === "en") return "your games get no completion conditions";
  if (locale === "ru") return "ваши игры не получают условий прохождения";
  return "ваші ігри не отримують умов проходження";
}

/** A text in a language, falling back to Russian — the content language (spec §5). */
function localizedIn(text: Localized, locale: Locale): string {
  return text[locale]?.trim() || text.ru;
}

/** A move that can only go back is an attack on whoever it moves (D9). */
function moveHarm(p: MoveActionDoc, env: StaticEnv): Harm {
  if ((p.who ?? "self") !== "target") return "none";
  return valueRange(p.by, env.params, env.decls).min < 0 ? "target" : "none";
}

export const ACTIONS: { [K in ActionOp]: ActionDef<Extract<ActionDoc, { op: K }>> } = {
  steps: {
    op: "steps",
    stage: 1,
    schema: StepsAction,
    triggers: ["afterMovement"],
    needsTarget: () => false,
    sourceFields: ["delta"],
    paramsUsed: (p) => valueParams(p.delta),
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      out.stepsDelta += runValue(p.delta, ctx, env);
    },
    cost: (p, env, play) => averageMagnitude(rangeOf(p.delta, env, play)),
    sign: (p, env, play) => signOf(averageSigned(rangeOf(p.delta, env, play))),
    text: {
      en: (p, env) => {
        if (isSourceValue(p.delta)) return `your move is ${sourceUp(p.delta) ? "longer" : "shorter"} by ${sourceBy("en", p.delta, NOUNS.cell)}`;
        const r = rangeOf(p.delta, env);
        switch (direction(r)) {
          case "up":
            return `your move is ${nounAfter("en", r, NOUNS.cell)} longer`;
          case "down":
            return `your move is ${nounAfter("en", r, NOUNS.cell)} shorter`;
          case "zero":
            return "your move is unchanged";
          default:
            return `your move changes by ${span(r)} ${plural("en", amount(r).hi, NOUNS.cell)}`;
        }
      },
      ru: (p, env) => {
        if (isSourceValue(p.delta)) return `ваш ход ${sourceUp(p.delta) ? "длиннее" : "короче"} на ${sourceBy("ru", p.delta, NOUNS.cell)}`;
        const r = rangeOf(p.delta, env);
        switch (direction(r)) {
          case "up":
            return `ваш ход длиннее на ${nounAfter("ru", r, NOUNS.cell)}`;
          case "down":
            return `ваш ход короче на ${nounAfter("ru", r, NOUNS.cell)}`;
          case "zero":
            return "ваш ход не меняется";
          default:
            return `ваш ход меняется на ${span(r)} ${plural("ru", amount(r).hi, NOUNS.cell)}`;
        }
      },
      uk: (p, env) => {
        if (isSourceValue(p.delta)) return `ваш хід ${sourceUp(p.delta) ? "довший" : "коротший"} на ${sourceBy("uk", p.delta, NOUNS.cell)}`;
        const r = rangeOf(p.delta, env);
        switch (direction(r)) {
          case "up":
            return `ваш хід довший на ${nounAfter("uk", r, NOUNS.cell)}`;
          case "down":
            return `ваш хід коротший на ${nounAfter("uk", r, NOUNS.cell)}`;
          case "zero":
            return "ваш хід не змінюється";
          default:
            return `ваш хід змінюється на ${span(r)} ${plural("uk", amount(r).hi, NOUNS.cell)}`;
        }
      },
    },
  },
  dice: {
    op: "dice",
    stage: 1,
    schema: DiceAction,
    triggers: ["beforeMovement"],
    needsTarget: () => false,
    paramsUsed: (p) => [...valueParams(p.count), ...valueParams(p.sides)],
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      if (p.count !== undefined) out.diceCountDelta += runValue(p.count, ctx, env);
      if (p.sides !== undefined) out.diceSidesDelta += runValue(p.sides, ctx, env);
    },
    cost: (p, env, play) => Math.abs(diceWorth(p, env, play)),
    sign: (p, env, play) => signOf(diceWorth(p, env, play)),
    text: {
      en: (p, env) =>
        diceClauses(p, env, {
          sidesUp: (n, noun) => `your dice have ${n} more ${noun}`,
          sidesDown: (n, noun) => `your dice have ${n} fewer ${noun}`,
          sidesMixed: (s, noun) => `your dice change by ${s} ${noun}`,
          countUp: (n, noun) => `you roll ${n} more ${noun}`,
          countDown: (n, noun) => `you roll ${n} fewer ${noun}`,
          countMixed: (s, noun) => `the number of dice changes by ${s} ${noun}`,
        }),
      ru: (p, env) =>
        diceClauses(p, env, {
          sidesUp: (n, noun) => `у ваших кубиков на ${n} ${noun} больше`,
          sidesDown: (n, noun) => `у ваших кубиков на ${n} ${noun} меньше`,
          sidesMixed: (s, noun) => `грани ваших кубиков меняются на ${s} ${noun}`,
          countUp: (n, noun) => `вы бросаете на ${n} ${noun} больше`,
          countDown: (n, noun) => `вы бросаете на ${n} ${noun} меньше`,
          countMixed: (s, noun) => `число кубиков меняется на ${s} ${noun}`,
        }),
      uk: (p, env) =>
        diceClauses(p, env, {
          sidesUp: (n, noun) => `у ваших кубиків на ${n} ${noun} більше`,
          sidesDown: (n, noun) => `у ваших кубиків на ${n} ${noun} менше`,
          sidesMixed: (s, noun) => `грані ваших кубиків змінюються на ${s} ${noun}`,
          countUp: (n, noun) => `ви кидаєте на ${n} ${noun} більше`,
          countDown: (n, noun) => `ви кидаєте на ${n} ${noun} менше`,
          countMixed: (s, noun) => `кількість кубиків змінюється на ${s} ${noun}`,
        }),
    },
  },
  balance: {
    op: "balance",
    stage: 1,
    schema: BalanceAction,
    triggers: ["afterCellEffect", "onOutcome", "onTick", ...EXECUTOR_TRIGGERS, "onSameCell"],
    needsTarget: (p) => p.to === "target",
    sourceFields: ["amount"],
    paramsUsed: (p) => valueParams(p.amount),
    refs: () => [],
    harm: (p, env) => (p.to === "target" && rangeOf(p.amount, env).min < 0 ? "target" : "none"),
    apply: (p, ctx, env, out) => {
      const delta = runValue(p.amount, ctx, env);
      if (delta === 0) return;
      const to = recipient(p.to ?? "self", ctx);
      if (to === null) return;
      // At a turn hook the reducer folds it into the move's ledger line; anywhere
      // else the executor writes its own.
      if (ctx.turn !== null && to === ctx.self.seasonPlayerId) {
        out.balanceDelta += delta;
        return;
      }
      out.intents.push({ kind: "balance", to, delta, reason: reasonFor(env) });
    },
    cost: (p, env, play) => {
      // Points ride on the next roll; a loss takes only what is there.
      const mean = averageSigned(rangeOf(p.amount, env, play));
      return PLAY_MODEL.pointValue * (mean >= 0 ? mean : -mean * PLAY_MODEL.pointsHeld);
    },
    // Points for the chosen player are the user's loss, and the other way round.
    sign: (p, env, play) => (signOf(averageSigned(rangeOf(p.amount, env, play))) * (p.to === "target" ? -1 : 1)) as Sign,
    text: {
      en: (p, env) => balanceClause("en", p, env),
      ru: (p, env) => balanceClause("ru", p, env),
      uk: (p, env) => balanceClause("uk", p, env),
    },
  },
  skipCellEffect: {
    op: "skipCellEffect",
    stage: 1,
    schema: SkipCellEffectAction,
    triggers: ["beforeCellEffect"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.skipCellEffect = true;
    },
    cost: (_p, _env, play) => skipValue(play.cells),
    // A penalty kept from firing spares a loss; a bonus kept from firing is one.
    sign: (_p, _env, play) => signOf(skipWorth(play.cells)),
    text: {
      en: () => "the cell does not fire",
      ru: () => "клетка не срабатывает",
      uk: () => "клітинка не спрацьовує",
    },
  },
  noMove: {
    op: "noMove",
    stage: 1,
    schema: NoMoveAction,
    triggers: ["afterMovement"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.cancelMove = true;
    },
    cost: (_p, _env, play) => Math.abs(noMoveWorth(play)),
    sign: (_p, _env, play) => signOf(noMoveWorth(play)),
    text: {
      en: () => "you do not move",
      ru: () => "вы остаётесь на месте",
      uk: () => "ви залишаєтеся на місці",
    },
  },
  grantEffect: {
    op: "grantEffect",
    stage: 1,
    schema: GrantEffectAction,
    triggers: GRANTING_TRIGGERS,
    needsTarget: (p) => p.to === "target",
    paramsUsed: () => [],
    refs: (p) => [{ ref: p.entry, kind: "effect" }],
    harm: grantHarm,
    apply: (p, ctx, env, out) => grantInto(p, "effect", ctx, env, out),
    cost: (p, env) => grantCost(p.entry, env),
    sign: (p, env) => grantSign(p, env),
    text: {
      en: (p, env) =>
        `${p.to === "self" ? "you get" : "the chosen player gets"} ${quote("en", refName(p.entry, env))}`,
      ru: (p, env) =>
        `${p.to === "self" ? "вы получаете" : "выбранный игрок получает"} ${quote("ru", refName(p.entry, env))}`,
      uk: (p, env) =>
        `${p.to === "self" ? "ви отримуєте" : "обраний гравець отримує"} ${quote("uk", refName(p.entry, env))}`,
    },
  },
  grantItem: {
    op: "grantItem",
    stage: 1,
    schema: GrantItemAction,
    triggers: GRANTING_TRIGGERS,
    needsTarget: (p) => p.to === "target",
    paramsUsed: () => [],
    refs: (p) => [{ ref: p.entry, kind: "item" }],
    harm: grantHarm,
    apply: (p, ctx, env, out) => grantInto(p, "item", ctx, env, out),
    cost: (p, env) => grantCost(p.entry, env),
    sign: (p, env) => grantSign(p, env),
    text: {
      en: (p, env) =>
        `${p.to === "self" ? "you get" : "the chosen player gets"} the item ${quote("en", refName(p.entry, env))}`,
      ru: (p, env) =>
        `${p.to === "self" ? "вы получаете" : "выбранный игрок получает"} предмет ${quote("ru", refName(p.entry, env))}`,
      uk: (p, env) =>
        `${p.to === "self" ? "ви отримуєте" : "обраний гравець отримує"} предмет ${quote("uk", refName(p.entry, env))}`,
    },
  },
  cleanse: {
    op: "cleanse",
    stage: 1,
    schema: CleanseAction,
    triggers: GRANTING_TRIGGERS,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, _env, out) => {
      out.intents.push({
        kind: "cleanse",
        from: ctx.self.seasonPlayerId,
        character: p.character ?? null,
        tags: p.tags ?? [],
        count: p.count,
      });
    },
    cost: (p) => (p.count === "all" ? 3 : Math.min(3, p.count)),
    // Clearing the holder's bonuses is a setback; anything else clears penalties.
    sign: (p) => (p.character === "bonus" ? -1 : 1),
    text: {
      en: (p) => {
        const adj = p.character ? CHARACTER_ADJ.en[p.character] : { all: "", one: "", some: "" };
        const tags = tagSuffix("en", p.tags);
        if (p.count === "all") return `removes all your ${adj.all}effects${tags}`;
        if (p.count === 1) return `removes one of your ${adj.one}effects${tags}`;
        return `removes up to ${p.count} of your ${adj.some}effects${tags}`;
      },
      ru: (p) => {
        const adj = p.character ? CHARACTER_ADJ.ru[p.character] : { all: "", one: "", some: "" };
        const tags = tagSuffix("ru", p.tags);
        if (p.count === "all") return `снимает все ваши ${adj.all}эффекты${tags}`;
        if (p.count === 1) return `снимает один ваш ${adj.one}эффект${tags}`;
        return `снимает до ${p.count} ваших ${adj.some}эффектов${tags}`;
      },
      uk: (p) => {
        const adj = p.character ? CHARACTER_ADJ.uk[p.character] : { all: "", one: "", some: "" };
        const tags = tagSuffix("uk", p.tags);
        if (p.count === "all") return `знімає всі ваші ${adj.all}ефекти${tags}`;
        if (p.count === 1) return `знімає один ваш ${adj.one}ефект${tags}`;
        return `знімає до ${p.count} ваших ${adj.some}ефектів${tags}`;
      },
    },
  },
  reroll: {
    op: "reroll",
    stage: "B",
    schema: RerollAction,
    triggers: ["afterDice"],
    reacts: true,
    reactionOnly: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.rerollAll = true;
    },
    // Used on a bad throw only (§6.15): it always helps.
    cost: (_p, _env, play) => reactionWorth({ ...NO_REACTION, reroll: true }, play),
    text: {
      en: () => "the dice are thrown again and the new throw stands",
      ru: () => "кубики перебрасываются, засчитывается новый бросок",
      uk: () => "кубики перекидаються, зараховується новий кидок",
    },
  },
  rerollOn: {
    op: "rerollOn",
    stage: "A",
    schema: RerollOnAction,
    triggers: ["afterDice"],
    reacts: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      for (const v of p.values) if (!out.rerollValues.includes(v)) out.rerollValues.push(v);
    },
    // Each die of a throw changes by what a reroll of its listed faces brings.
    ...reactable(
      dicePipeline((p: RerollOnActionDoc) => (dist, _outcome, dice) => {
        const perDie = meanOf(rerolledDie(dice.sides, p.values)) - meanOf(fairDie(dice.sides));
        return meanOf(dist) + perDie * dice.count;
      }),
      (p) => [{ ...NO_REACTION, rerollValues: [...p.values] }],
    ),
    text: {
      en: (p) => REROLL_WORDS.en(joinOr("en", p.values.map(String)), p.values.length > 1),
      ru: (p) => REROLL_WORDS.ru(joinOr("ru", p.values.map(String)), p.values.length > 1),
      uk: (p) => REROLL_WORDS.uk(joinOr("uk", p.values.map(String)), p.values.length > 1),
    },
  },
  bestOfTwo: {
    op: "bestOfTwo",
    stage: "A",
    schema: BestOfTwoAction,
    triggers: ["afterDice"],
    reacts: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.bestOfTwo = true;
    },
    // Better for the holder: the higher of two passes, the lower of two drops.
    ...reactable(
      dicePipeline(() => (dist, outcome) => meanOf(twoThrows(dist, outcome === "passed" ? "max" : "min"))),
      () => [{ ...NO_REACTION, bestOfTwo: true }],
    ),
    text: {
      en: () => "the dice are thrown twice and the better throw counts",
      ru: () => "кубики бросаются дважды, засчитывается лучший бросок",
      uk: () => "кубики кидаються двічі, зараховується кращий кидок",
    },
  },
  worstOfTwo: {
    op: "worstOfTwo",
    stage: "A",
    schema: WorstOfTwoAction,
    triggers: ["afterDice"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.worstOfTwo = true;
    },
    ...dicePipeline(() => (dist, outcome) => meanOf(twoThrows(dist, outcome === "passed" ? "min" : "max"))),
    text: {
      en: () => "the dice are thrown twice and the worse throw counts",
      ru: () => "кубики бросаются дважды, засчитывается худший бросок",
      uk: () => "кубики кидаються двічі, зараховується гірший кидок",
    },
  },
  resultModify: {
    op: "resultModify",
    stage: "A",
    schema: ResultModifyAction,
    triggers: ["afterDice"],
    reacts: true,
    needsTarget: () => false,
    sourceFields: ["delta"],
    paramsUsed: (p) => [...valueParams(p.delta), ...valueParams(p.cap)],
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      if (p.delta !== undefined) out.resultDelta += runValue(p.delta, ctx, env);
      if (p.cap !== undefined) {
        const cap = runValue(p.cap, ctx, env);
        out.resultCap = out.resultCap === null ? cap : Math.min(out.resultCap, cap);
      }
    },
    ...reactable(
      dicePipeline((p: ResultModifyActionDoc, env: StaticEnv, play: PlayContext) => {
        const deltas = p.delta === undefined ? [0] : spanValues(rangeOf(p.delta, env, play));
        const cap = p.cap === undefined ? null : valueRange(p.cap, env.params, env.decls).max;
        const after = (sum: number, d: number) => (sum === 0 ? 0 : Math.max(1, cap === null ? sum + d : Math.min(cap, sum + d)));
        return (dist) => deltas.reduce((acc, d) => acc + expectedValue(dist, (sum) => after(sum, d)), 0) / deltas.length;
      }),
      (p, env, play) => {
        const cap = p.cap === undefined ? null : valueRange(p.cap, env.params, env.decls).max;
        const deltas = p.delta === undefined ? [0] : spanValues(rangeOf(p.delta, env, play));
        return deltas.map((d) => ({ ...NO_REACTION, resultDelta: d, resultCap: cap }));
      },
    ),
    text: {
      en: (p, env) => resultClause("en", p, env),
      ru: (p, env) => resultClause("ru", p, env),
      uk: (p, env) => resultClause("uk", p, env),
    },
  },
  direction: {
    op: "direction",
    stage: "A",
    schema: DirectionAction,
    triggers: ["afterDice"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.reverseLowerHalf = true;
    },
    ...dicePipeline(() => (dist, outcome, dice) => {
      // The lower half of the range goes back, the upper half forward — as a
      // signed result in the direction a pass (or a drop) would have gone.
      const middle = (dice.count * (dice.sides + 1)) / 2;
      return expectedValue(dist, (sum) => {
        const forward = sum >= middle;
        if (outcome === "passed") return forward ? sum : -sum;
        return forward ? -sum : sum;
      });
    }),
    text: {
      en: () => "the lower half of the dice range moves you back by the result, the upper half forward",
      ru: () => "нижняя половина значений кубиков ведёт вас назад на выпавшее число, верхняя — вперёд",
      uk: () => "нижня половина значень кубиків веде вас назад на випале число, верхня — уперед",
    },
  },
  move: {
    op: "move",
    stage: "A",
    schema: MoveAction,
    triggers: EXECUTOR_TRIGGERS,
    needsTarget: (p) => p.who === "target",
    sourceFields: ["by"],
    paramsUsed: (p) => valueParams(p.by),
    refs: () => [],
    harm: moveHarm,
    apply: (p, ctx, env, out) => {
      const who = mover(p.who ?? "self", ctx);
      if (who === null) return;
      const by = runValue(p.by, ctx, env);
      out.intents.push({ kind: "move", who, to: { by }, key: env.entry.slug });
    },
    // The cells it moves, on average — a table at its faces' odds, a source at the play model's mean.
    cost: (p, env, play) => Math.abs(valueMean(p.by, env.params, env.decls, play)),
    // Forward is the holder's gain; the chosen player sent back is the user's.
    sign: (p, env, play) => (signOf(valueMean(p.by, env.params, env.decls, play)) * (p.who === "target" ? -1 : 1)) as Sign,
    text: {
      en: (p, env) => moveText("en", p, env),
      ru: (p, env) => moveText("ru", p, env),
      uk: (p, env) => moveText("uk", p, env),
    },
  },
  moveToTarget: {
    op: "moveToTarget",
    stage: "A",
    schema: MoveToTargetAction,
    triggers: EXECUTOR_TRIGGERS,
    needsTarget: () => true,
    aimedOnly: true,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      if (!ctx.target) return;
      out.intents.push({ kind: "move", who: ctx.self.seasonPlayerId, to: { player: ctx.target.seasonPlayerId, at: p.at }, key: env.entry.slug });
    },
    // Catching up with a player ahead: the gap a holder aims across.
    cost: (p) => (p.at === "cell" ? PLAY_MODEL.aimGap : PLAY_MODEL.aimGap - 1),
    text: {
      en: (p) => (p.at === "cell" ? "you instantly move to the chosen player's cell" : "you instantly move to the cell right before the chosen player"),
      ru: (p) =>
        p.at === "cell"
          ? "вы мгновенно перемещаетесь на клетку выбранного игрока"
          : "вы мгновенно перемещаетесь на клетку прямо перед выбранным игроком",
      uk: (p) =>
        p.at === "cell"
          ? "ви миттєво переміщуєтеся на клітинку обраного гравця"
          : "ви миттєво переміщуєтеся на клітинку просто перед обраним гравцем",
    },
  },
  swapPositions: {
    op: "swapPositions",
    stage: "A",
    schema: SwapPositionsAction,
    triggers: EXECUTOR_TRIGGERS,
    needsTarget: (p) => p.with === "target",
    paramsUsed: () => [],
    refs: () => [],
    harm: (p) => (p.with === "target" ? "target" : "none"),
    apply: (p, ctx, env, out) => {
      const self = ctx.self.seasonPlayerId;
      if (p.with === "target") {
        if (!ctx.target) return;
        out.intents.push({ kind: "move", who: self, to: { swapWith: ctx.target.seasonPlayerId }, key: env.entry.slug });
      } else {
        out.intents.push({ kind: "move", who: self, to: { swapWith: { nearestBehind: self } }, key: env.entry.slug });
      }
    },
    // Both sides move by the gap: the lead between them changes by twice that.
    cost: (p) => 2 * (p.with === "target" ? PLAY_MODEL.aimGap : PLAY_MODEL.behindGap),
    // With a player ahead it is a leap; with the rival behind, a fall.
    sign: (p) => (p.with === "target" ? 1 : -1),
    text: {
      en: (p) =>
        p.with === "target"
          ? "you instantly swap places with the chosen player"
          : "you instantly swap places with the nearest rival behind you",
      ru: (p) =>
        p.with === "target"
          ? "вы мгновенно меняетесь местами с выбранным игроком"
          : "вы мгновенно меняетесь местами с ближайшим соперником позади",
      uk: (p) =>
        p.with === "target"
          ? "ви миттєво міняєтеся місцями з обраним гравцем"
          : "ви миттєво міняєтеся місцями з найближчим суперником позаду",
    },
  },
  rollbackLastMove: {
    op: "rollbackLastMove",
    stage: "A",
    schema: RollbackLastMoveAction,
    triggers: EXECUTOR_TRIGGERS,
    needsTarget: (p) => p.who === "target",
    paramsUsed: () => [],
    refs: () => [],
    harm: (p) => (p.who === "target" ? "target" : "none"),
    apply: (p, ctx, env, out) => {
      const who = mover(p.who, ctx);
      if (who === null) return;
      out.intents.push({ kind: "move", who, to: { lastMoveStart: true }, key: env.entry.slug });
    },
    // Used when it pays: a rival's passed game undone, or your own drop.
    cost: (p) =>
      p.who === "target" ? PLAY_MODEL.dieMean * PLAY_MODEL.passDice : PLAY_MODEL.dieMean * PLAY_MODEL.dropDice,
    text: {
      en: (p) =>
        p.who === "target"
          ? "the chosen player instantly returns to the cell their last move started from"
          : "you instantly return to the cell your last move started from",
      ru: (p) =>
        p.who === "target"
          ? "выбранный игрок мгновенно возвращается на клетку, с которой начался его последний ход"
          : "вы мгновенно возвращаетесь на клетку, с которой начался ваш последний ход",
      uk: (p) =>
        p.who === "target"
          ? "обраний гравець миттєво повертається на клітинку, з якої почався його останній хід"
          : "ви миттєво повертаєтеся на клітинку, з якої почався ваш останній хід",
    },
  },
  halveGap: {
    op: "halveGap",
    stage: "A",
    schema: HalveGapAction,
    triggers: EXECUTOR_TRIGGERS,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, ctx, env, out) => {
      const self = ctx.self.seasonPlayerId;
      out.intents.push({ kind: "move", who: { nearestBehind: self }, to: { halfwayTo: self }, key: env.entry.slug });
    },
    cost: () => PLAY_MODEL.behindGap / 2,
    sign: () => -1,
    text: {
      en: () => "the nearest rival behind you instantly halves the gap to you",
      ru: () => "ближайший соперник позади вас мгновенно сокращает отставание от вас вдвое",
      uk: () => "найближчий суперник позаду вас миттєво скорочує відставання від вас удвічі",
    },
  },
  remove: {
    op: "remove",
    stage: "A",
    schema: RemoveAction,
    triggers: GRANTING_TRIGGERS,
    needsTarget: (p) => p.from === "target",
    paramsUsed: () => [],
    refs: (p) => (p.entry && p.what !== "any" ? [{ ref: p.entry, kind: p.what }] : []),
    // Taking a rival's penalties away helps them; anything else is an attack (D9).
    harm: (p) => (p.from === "target" && p.character !== "penalty" ? "target" : "none"),
    apply: (p, ctx, env, out) => {
      const from = p.from === "target" ? (ctx.target?.seasonPlayerId ?? null) : ctx.self.seasonPlayerId;
      if (from === null) return;
      const entryId = p.entry ? (env.resolve(p.entry)?.entryId ?? null) : null;
      if (p.entry && entryId === null) return;
      const base = { kind: "remove" as const, from, what: p.what, character: p.character ?? null, entryId, rarity: p.rarity ?? null };
      if (p.pick === "choice") {
        // The use guard asked for the choice; without one there is nothing to take.
        if (ctx.choice) out.intents.push({ ...base, pick: { instanceId: ctx.choice }, count: 1 });
        return;
      }
      out.intents.push({ ...base, pick: p.pick, count: p.count ?? 1 });
    },
    // What it takes: the entry's own power when named, an unknown entry's worth
    // otherwise — measured, a removed poison is worth three cells, not one — and
    // a bonus item of the rarities it names what one of them is worth (wave B).
    cost: (p, env) => {
      if (p.entry) return grantCost(p.entry, env) * (p.count ?? 1);
      const rarityItem = p.rarity !== undefined && p.what === "item" && p.character === "bonus";
      return (rarityItem ? heldItemWorth(p.rarity) : GRANT_UNKNOWN) * (p.count ?? 1);
    },
    // Taking the holder's penalties — or the chosen player's bonuses — helps; the other way round, it hurts.
    sign: (p, env) => {
      const character = p.character ?? (p.entry ? env.resolve(p.entry)?.character : undefined);
      const fromTarget = p.from === "target";
      if (character === undefined) return 1;
      return (character === "penalty") !== fromTarget ? 1 : -1;
    },
    text: {
      en: (p, env) => removeText("en", p, env),
      ru: (p, env) => removeText("ru", p, env),
      uk: (p, env) => removeText("uk", p, env),
    },
  },
  stealItem: {
    op: "stealItem",
    stage: "B",
    schema: StealItemAction,
    triggers: ["onUse"],
    needsTarget: () => true,
    aimedOnly: true,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "target",
    apply: (p, ctx, _env, out) => {
      if (!ctx.target) return;
      out.intents.push({
        kind: "moveItems",
        from: ctx.target.seasonPlayerId,
        to: ctx.self.seasonPlayerId,
        count: p.count ?? 1,
        rarity: p.rarity ?? null,
        how: "stolen",
        except: ctx.instanceId ?? null,
      });
    },
    // The user gains what the chosen player loses: the lead between them moves by twice the item.
    cost: (p) => 2 * heldItemWorth(p.rarity) * (p.count ?? 1),
    text: {
      en: (p) => `you take ${randomItems("en", p.count ?? 1, p.rarity, false)} from the chosen player`,
      ru: (p) => `вы забираете у выбранного игрока ${randomItems("ru", p.count ?? 1, p.rarity, false)}`,
      uk: (p) => `ви забираєте в обраного гравця ${randomItems("uk", p.count ?? 1, p.rarity, false)}`,
    },
  },
  transferItem: {
    op: "transferItem",
    stage: "B",
    schema: TransferItemAction,
    triggers: GRANTING_TRIGGERS,
    needsTarget: (p) => p.to === "target",
    paramsUsed: () => [],
    refs: () => [],
    // A bonus handed over is a gift, not an attack (D9).
    harm: () => "none",
    apply: (p, ctx, _env, out) => {
      const self = ctx.self.seasonPlayerId;
      const to = p.to === "target" ? (ctx.target?.seasonPlayerId ?? null) : { randomRivalOf: self };
      if (to === null) return;
      out.intents.push({
        kind: "moveItems",
        from: self,
        to,
        count: p.count ?? 1,
        rarity: p.rarity ?? null,
        how: "given",
        except: ctx.instanceId ?? null,
      });
    },
    // What the holder gives away the receiver gains — as many as the holder has to give.
    cost: (p) => 2 * heldItemWorth(p.rarity) * itemsHeldUpTo(p.count ?? 1, p.rarity),
    sign: () => -1,
    text: {
      en: (p) => transferText("en", p),
      ru: (p) => transferText("ru", p),
      uk: (p) => transferText("uk", p),
    },
  },
  swapItems: {
    op: "swapItems",
    stage: "B",
    schema: SwapItemsAction,
    triggers: ["onUse"],
    needsTarget: () => true,
    aimedOnly: true,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "target",
    apply: (p, ctx, _env, out) => {
      if (!ctx.target) return;
      out.intents.push({
        kind: "swapItems",
        a: ctx.self.seasonPlayerId,
        b: ctx.target.seasonPlayerId,
        rarity: p.rarity ?? null,
        except: ctx.instanceId ?? null,
      });
    },
    // A random item for a random one: what it gains is in whom the user picks to trade with.
    cost: (p) => 2 * PLAY_MODEL.tradeEdge * heldItemWorth(p.rarity),
    text: {
      en: (p) => `you and the chosen player give each other a random ${rarityWords("en", p.rarity)}bonus item`,
      ru: (p) => `вы и выбранный игрок отдаёте друг другу по случайному ${rarityWords("ru", p.rarity, "dat")}бонусному предмету`,
      uk: (p) => `ви й обраний гравець віддаєте одне одному по випадковому ${rarityWords("uk", p.rarity, "dat")}бонусному предмету`,
    },
  },
  copyItem: {
    op: "copyItem",
    stage: "B",
    schema: CopyItemAction,
    triggers: ["onUse"],
    needsTarget: () => true,
    aimedOnly: true,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, _env, out) => {
      if (!ctx.target) return;
      out.intents.push({
        kind: "copyItem",
        from: ctx.target.seasonPlayerId,
        to: ctx.self.seasonPlayerId,
        rarity: p.rarity ?? null,
        except: ctx.instanceId ?? null,
      });
    },
    // A fresh copy for the user; the chosen player keeps theirs.
    cost: (p) => heldItemWorth(p.rarity),
    text: {
      en: (p) => `you get a copy of a random ${rarityWords("en", p.rarity)}bonus item the chosen player holds; they keep theirs`,
      ru: (p) => `вы получаете копию случайного ${rarityWords("ru", p.rarity, "gen")}бонусного предмета выбранного игрока, а он сохраняет свой`,
      uk: (p) => `ви отримуєте копію випадкового ${rarityWords("uk", p.rarity, "gen")}бонусного предмета обраного гравця, а він зберігає свій`,
    },
  },
  grantChosen: {
    op: "grantChosen",
    stage: "B",
    schema: GrantChosenAction,
    triggers: ["onUse"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, ctx, env, out) => {
      // The use guard asked for the pick and held it to the filter; without one there is nothing to hand out.
      if (!ctx.entryChoice) return;
      const facts = env.resolve({ entry: ctx.entryChoice });
      if (!facts || facts.kind !== "item") return;
      out.intents.push({ kind: "grant", entryId: facts.entryId, key: facts.slug, entryKind: "item", to: ctx.self.seasonPlayerId });
    },
    // The user picks the strongest the filter lets through.
    cost: (p) => bestItemWorth(p.rarity),
    text: {
      en: (p) => chosenText("en", p),
      ru: (p) => chosenText("ru", p),
      uk: (p) => chosenText("uk", p),
    },
  },
  extraSpin: {
    op: "extraSpin",
    stage: "B",
    schema: ExtraSpinAction,
    triggers: ["afterCellEffect", "onOutcome"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.extraSpins.push(p.pool === "bonus" ? "positive" : "negative");
    },
    cost: (p) => Math.abs(PLAY_MODEL.spin[p.pool]),
    sign: (p) => (p.pool === "bonus" ? 1 : -1),
    text: {
      en: (p) => `the ${p.pool} wheel spins once more`,
      ru: (p) => `${p.pool === "bonus" ? "бонусное" : "штрафное"} колесо крутится ещё раз`,
      uk: (p) => `${p.pool === "bonus" ? "бонусне" : "штрафне"} колесо крутиться ще раз`,
    },
  },
  block: {
    op: "block",
    stage: "B",
    schema: BlockAction,
    triggers: ["onIncoming"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.answer = { kind: "block" };
    },
    // What it stops: a setback spared, or a bonus kept off.
    cost: (_p, _env, play) => Math.abs(arrivalWorth(play)),
    sign: (_p, _env, play) => (arrivalWorth(play) > 0 ? -1 : 1),
    text: {
      en: () => "it is cancelled",
      ru: () => "это отменяется",
      uk: () => "це скасовується",
    },
  },
  reflect: {
    op: "reflect",
    stage: "B",
    schema: ReflectAction,
    triggers: ["onIncoming"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.answer = { kind: "reflect" };
    },
    // A harmful action stopped, and turned back on whoever aimed it.
    cost: () => PLAY_MODEL.arrival.harm.worth + PLAY_MODEL.arrival.harm.turned,
    text: {
      en: () => "it is cancelled and turned back on that rival",
      ru: () => "это отменяется и обращается против этого соперника",
      uk: () => "це скасовується й обертається проти цього суперника",
    },
  },
  amplify: {
    op: "amplify",
    stage: "B",
    schema: AmplifyAction,
    triggers: ["onIncoming"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.answer = { kind: "amplify", factor: p.factor };
    },
    // What arrives, that many times more — a bonus's way or a penalty's.
    cost: (p, _env, play) => Math.abs((p.factor - 1) * arrivalWorth(play)),
    sign: (_p, _env, play) => signOf(arrivalWorth(play)),
    text: {
      en: (p) => `it fires ${TIMES.en[p.factor]}`,
      ru: (p) => `это срабатывает ${TIMES.ru[p.factor]}`,
      uk: (p) => `це спрацьовує ${TIMES.uk[p.factor]}`,
    },
  },
  replace: {
    op: "replace",
    stage: "B",
    schema: ReplaceAction,
    triggers: ["onIncoming"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.answer = { kind: "replace", with: p.with };
    },
    // What it stops, and the cells forward instead.
    cost: (p, _env, play) => Math.abs(p.with - arrivalWorth(play)),
    sign: (p, _env, play) => signOf(p.with - arrivalWorth(play)),
    text: {
      en: (p) => replaceText("en", p),
      ru: (p) => replaceText("ru", p),
      uk: (p) => replaceText("uk", p),
    },
  },
  untargetable: {
    op: "untargetable",
    stage: "B",
    schema: UntargetableAction,
    triggers: ["whileActive"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.untargetable = true;
    },
    // Each roll: the harmful actions it would have brought.
    cost: () => PLAY_MODEL.arrival.harm.perRoll * PLAY_MODEL.arrival.harm.worth,
    text: {
      en: () => "rivals cannot aim items at you",
      ru: () => "соперники не могут выбрать вас целью предмета",
      uk: () => "суперники не можуть обрати вас ціллю предмета",
    },
  },
  forbidItems: {
    op: "forbidItems",
    stage: "B",
    schema: ForbidItemsAction,
    triggers: ["whileActive"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.forbidItems = true;
    },
    // Each roll: the items it hands out wait — part of their worth is lost to the wait.
    cost: () => PLAY_MODEL.delayLoss * PLAY_MODEL.arrival.entry.bonus.item.perRoll * PLAY_MODEL.arrival.entry.bonus.item.worth,
    sign: () => -1,
    text: {
      en: () => "you cannot use items",
      ru: () => "вы не можете использовать предметы",
      uk: () => "ви не можете використовувати предмети",
    },
  },
  pierce: {
    op: "pierce",
    stage: "B",
    schema: PierceAction,
    triggers: ["whileActive"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.pierce += p.value;
    },
    // Each roll: the harmful actions a protection would have stopped.
    cost: () => PLAY_MODEL.arrival.harm.perRoll * PLAY_MODEL.arrival.harm.worth * PLAY_MODEL.shielded,
    sign: () => -1,
    text: {
      en: (p) => pierceText("en", p),
      ru: (p) => pierceText("ru", p),
      uk: (p) => pierceText("uk", p),
    },
  },
  victimChoice: {
    op: "victimChoice",
    stage: "B",
    schema: VictimChoiceAction,
    triggers: ["onApply", "onPickup", "onOutcome", "onTick"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    // The holder's own entry asks them; one handed to a rival is answered as the grant it is (§6.13).
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      out.intents.push({
        kind: "decide",
        who: ctx.self.seasonPlayerId,
        count: p.count ?? 1,
        orKeep: p.orKeep === true,
        instanceId: ctx.instanceId ?? null,
        key: env.entry.slug,
      });
    },
    // The holder gives up their commonest; with `orKeep` they take the cheaper way — the entry's other rules.
    cost: (p) => (p.orKeep ? 0 : (p.count ?? 1) * heldItemWorth(["common"])),
    sign: () => -1,
    text: {
      en: (p) => victimChoiceText("en", p),
      ru: (p) => victimChoiceText("ru", p),
      uk: (p) => victimChoiceText("uk", p),
    },
  },
  holdLimit: {
    op: "holdLimit",
    stage: "B",
    schema: HoldLimitAction,
    triggers: ["whileActive"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.holdLimit = out.holdLimit === null ? p.max : Math.min(out.holdLimit, p.max);
    },
    // Each roll: what a holder has over the limit, and one more arriving, burns.
    cost: (p) => (itemsHeldOver(p.max) + PLAY_MODEL.arrival.entry.bonus.item.perRoll) * heldItemWorth(null),
    sign: () => -1,
    text: {
      en: (p) => holdLimitText("en", p),
      ru: (p) => holdLimitText("ru", p),
      uk: (p) => holdLimitText("uk", p),
    },
  },
  poolExclude: {
    op: "poolExclude",
    stage: "C",
    schema: PoolExcludeAction,
    triggers: ["beforeGameRoll"],
    needsTarget: () => false,
    paramsUsed: (p) => poolParams(p),
    refs: () => [],
    // The holder's own next game — nobody else's (spec §6.16).
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      const match = readMatch(p, ctx, env);
      if (match) out.pool.push({ kind: "exclude", match });
    },
    // The chance to pass the game it leaves them: their pick's way up, the rest down (an assumption, `PLAY_MODEL.pool`).
    cost: (p) => Math.abs(poolWorth(poolShift(p, "exclude"))),
    sign: (p) => signOf(poolShift(p, "exclude")),
    text: {
      en: (p, env) => excludeText("en", p, env),
      ru: (p, env) => excludeText("ru", p, env),
      uk: (p, env) => excludeText("uk", p, env),
    },
  },
  poolRequire: {
    op: "poolRequire",
    stage: "C",
    schema: PoolRequireAction,
    triggers: ["beforeGameRoll"],
    needsTarget: () => false,
    paramsUsed: (p) => poolParams(p),
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      const match = readMatch(p, ctx, env);
      if (match) out.pool.push({ kind: "require", match });
    },
    cost: (p) => Math.abs(poolWorth(poolShift(p, "require"))),
    sign: (p) => signOf(poolShift(p, "require")),
    text: {
      en: (p, env) => requireText("en", p, env),
      ru: (p, env) => requireText("ru", p, env),
      uk: (p, env) => requireText("uk", p, env),
    },
  },
  poolFavor: {
    op: "poolFavor",
    stage: "C",
    schema: PoolFavorAction,
    triggers: ["beforeGameRoll"],
    readsPick: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, _env, out) => {
      // The game the use picked; with none remembered there is nothing to favour.
      if (ctx.chosen && "gameId" in ctx.chosen) out.pool.push({ kind: "favor", gameId: ctx.chosen.gameId, factor: p.factor });
    },
    cost: (p) => poolWorth(PLAY_MODEL.pool.favor * (p.factor - 1)),
    text: {
      en: (p) => favorText("en", p),
      ru: (p) => favorText("ru", p),
      uk: (p) => favorText("uk", p),
    },
  },
  chooseOfN: {
    op: "chooseOfN",
    stage: "C",
    schema: ChooseOfNAction,
    triggers: ["beforeGameRoll"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.pool.push({ kind: "choose", n: p.n });
    },
    // The chance to pass a game the holder chose among n (an assumption, `PLAY_MODEL.pool.choice`).
    cost: (p) => poolWorth(PLAY_MODEL.pool.choice[p.n as 2 | 3 | 4 | 5]),
    text: {
      en: (p) => chooseText("en", p),
      ru: (p) => chooseText("ru", p),
      uk: (p) => chooseText("uk", p),
    },
  },
  rerollGame: {
    op: "rerollGame",
    stage: "C",
    schema: RerollGameAction,
    triggers: ["onUse"],
    openRollOnly: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    // The user's own game, whomever the item is aimed at (spec §6.16).
    harm: () => "none",
    apply: (_p, ctx, env, out) => {
      out.intents.push({ kind: "game", how: "reroll", who: ctx.self.seasonPlayerId, afterRolls: null, key: env.entry.slug });
    },
    cost: () => poolWorth(PLAY_MODEL.pool.reroll),
    text: {
      en: () => rerollGameText("en"),
      ru: () => rerollGameText("ru"),
      uk: () => rerollGameText("uk"),
    },
  },
  postponeGame: {
    op: "postponeGame",
    stage: "C",
    schema: PostponeGameAction,
    triggers: ["onUse"],
    openRollOnly: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      out.intents.push({
        kind: "game",
        how: "postpone",
        who: ctx.self.seasonPlayerId,
        afterRolls: p.afterRolls ?? AFTER_ROLLS.default,
        key: env.entry.slug,
      });
    },
    cost: () => poolWorth(PLAY_MODEL.pool.postpone),
    text: {
      en: (p) => postponeGameText("en", p),
      ru: (p) => postponeGameText("ru", p),
      uk: (p) => postponeGameText("uk", p),
    },
  },
  addCondition: {
    op: "addCondition",
    stage: "C",
    schema: AddConditionAction,
    triggers: ["onRollCreated"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    // The holder's own game; a rival's item that hands the entry out harms them as that grant does (spec §6.17).
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.conditions.push({ ...p.text });
    },
    // A condition takes from the chance to pass the game (an assumption, `PLAY_MODEL.pool.condition`).
    cost: () => Math.abs(poolWorth(PLAY_MODEL.pool.condition)),
    sign: () => -1,
    text: {
      en: (p) => addConditionText("en", p),
      ru: (p) => addConditionText("ru", p),
      uk: (p) => addConditionText("uk", p),
    },
  },
  conditionImmunity: {
    op: "conditionImmunity",
    stage: "C",
    schema: ConditionImmunityAction,
    triggers: ["whileActive"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.conditionImmunity = true;
    },
    // Each roll: the conditions its game would get, as often as they come (`PLAY_MODEL.arrival.condition`);
    // one that waits for them fires on a game that gets them — one condition kept off a firing.
    cost: (_p, _env, play) => (play.waits ? 1 : PLAY_MODEL.arrival.condition.perRoll) * Math.abs(poolWorth(PLAY_MODEL.pool.condition)),
    text: {
      en: () => conditionImmunityText("en"),
      ru: () => conditionImmunityText("ru"),
      uk: () => conditionImmunityText("uk"),
    },
  },
  placeObject: {
    op: "placeObject",
    stage: "D",
    schema: PlaceObjectAction,
    triggers: ["onUse"],
    placesOnly: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    // The board's, aimed at no one (spec §6.18).
    harm: () => "none",
    apply: (_p, ctx, env, out) => {
      // The cell the use picked; without one there is nowhere to stand.
      if (ctx.pick && "cell" in ctx.pick) out.intents.push({ kind: "place", by: ctx.self.seasonPlayerId, cell: ctx.pick.cell, key: env.entry.slug });
    },
    // What the object does is counted where it does it, at `onObjectEntered` (spec §14).
    cost: () => 0,
    text: {
      en: () => "the item stands on the chosen cell",
      ru: () => "предмет встаёт на выбранную клетку",
      uk: () => "предмет стає на обрану клітинку",
    },
  },
  stopMove: {
    op: "stopMove",
    stage: "D",
    schema: StopMoveAction,
    triggers: ["onObjectEntered"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.object.stop = true;
    },
    // The cells the move had left: half a pass's move — an object is met moving forward (spec §14).
    cost: () => meanRoll("passed") / 2,
    sign: () => -1,
    text: {
      en: () => "the move stops there without a landing",
      ru: () => "ход останавливается на ней без срабатывания клетки",
      uk: () => "хід зупиняється на ній без спрацювання клітинки",
    },
  },
  push: {
    op: "push",
    stage: "D",
    schema: PushAction,
    triggers: ["onObjectEntered"],
    needsTarget: () => false,
    paramsUsed: (p) => valueParams(p.delta),
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      out.object.push += runValue(p.delta, ctx, env);
    },
    cost: (p, env, play) => averageMagnitude(rangeOf(p.delta, env, play)),
    sign: (p, env, play) => signOf(averageSigned(rangeOf(p.delta, env, play))),
    text: {
      en: (p, env) => pushText("en", p, env),
      ru: (p, env) => pushText("ru", p, env),
      uk: (p, env) => pushText("uk", p, env),
    },
  },
  extend: {
    op: "extend",
    stage: "D",
    schema: ExtendAction,
    triggers: ["onObjectEntered"],
    needsTarget: () => false,
    paramsUsed: (p) => valueParams(p.delta),
    refs: () => [],
    harm: () => "none",
    apply: (p, ctx, env, out) => {
      out.object.extend += Math.max(0, runValue(p.delta, ctx, env));
    },
    cost: (p, env, play) => averageMagnitude(rangeOf(p.delta, env, play)),
    text: {
      en: (p, env) => extendText("en", p, env),
      ru: (p, env) => extendText("ru", p, env),
      uk: (p, env) => extendText("uk", p, env),
    },
  },
  spinInstead: {
    op: "spinInstead",
    stage: "D",
    schema: SpinInsteadAction,
    triggers: ["onObjectEntered"],
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    harm: () => "none",
    apply: (p, _ctx, _env, out) => {
      out.object.spin = p.pool === "bonus" ? "positive" : "negative";
    },
    // What its wheel drops (`PLAY_MODEL.spin`), the mover's.
    cost: (p) => Math.abs(PLAY_MODEL.spin[p.pool]),
    sign: (p) => (p.pool === "bonus" ? 1 : -1),
    text: {
      en: (p) => `the ${p.pool} wheel spins instead of the cell`,
      ru: (p) => `вместо клетки крутится ${p.pool === "bonus" ? "бонусное" : "штрафное"} колесо`,
      uk: (p) => `замість клітинки крутиться ${p.pool === "bonus" ? "бонусне" : "штрафне"} колесо`,
    },
  },
  takeEntry: {
    op: "takeEntry",
    stage: "D",
    schema: TakeEntryAction,
    triggers: ["onSameCell"],
    itemsOnly: true,
    needsTarget: () => false,
    paramsUsed: () => [],
    refs: () => [],
    // It takes from the holder, but nothing aims it: it is the board's, and nothing answers it (spec §6.19).
    harm: () => "none",
    apply: (_p, _ctx, _env, out) => {
      out.take = true;
    },
    // What the item is worth is counted for as long as it stays (`PLAY_MODEL.sameCell`, spec §14).
    cost: () => 0,
    text: {
      en: () => "the rival who arrived takes this item",
      ru: () => "пришедший соперник забирает этот предмет",
      uk: () => "суперник, що прийшов, забирає цей предмет",
    },
  },
};

interface DicePhrases {
  sidesUp: (n: string, noun: string) => string;
  sidesDown: (n: string, noun: string) => string;
  sidesMixed: (span: string, noun: string) => string;
  countUp: (n: string, noun: string) => string;
  countDown: (n: string, noun: string) => string;
  countMixed: (span: string, noun: string) => string;
}

function diceClauses(p: DiceActionDoc, env: TextEnv, words: DicePhrases): string {
  const parts: string[] = [];
  const one = (value: ValueDoc | undefined, noun: Noun, up: DicePhrases["sidesUp"], down: DicePhrases["sidesDown"], mixed: DicePhrases["sidesMixed"]) => {
    if (value === undefined) return;
    const r = rangeOf(value, env);
    const m = amount(r);
    const word = plural(env.locale, m.hi, noun);
    switch (direction(r)) {
      case "up":
        parts.push(up(m.text, word));
        return;
      case "down":
        parts.push(down(m.text, word));
        return;
      case "zero":
        return;
      default:
        parts.push(mixed(span(r), word));
    }
  };
  one(p.count, NOUNS.die, words.countUp, words.countDown, words.countMixed);
  one(p.sides, NOUNS.side, words.sidesUp, words.sidesDown, words.sidesMixed);
  if (parts.length === 0) {
    return env.locale === "en" ? "your dice are unchanged" : env.locale === "ru" ? "кубики не меняются" : "кубики не змінюються";
  }
  const and = env.locale === "en" ? " and " : env.locale === "ru" ? " и " : " і ";
  return parts.join(and);
}

const BALANCE_WORDS: Record<
  Locale,
  { gain: Record<"self" | "target", string>; lose: Record<"self" | "target", string>; change: Record<"self" | "target", string> }
> = {
  en: {
    gain: { self: "you gain", target: "the chosen player gains" },
    lose: { self: "you lose", target: "the chosen player loses" },
    change: { self: "your balance changes by", target: "the chosen player's balance changes by" },
  },
  ru: {
    gain: { self: "вы получаете", target: "выбранный игрок получает" },
    lose: { self: "вы теряете", target: "выбранный игрок теряет" },
    change: { self: "ваш баланс меняется на", target: "баланс выбранного игрока меняется на" },
  },
  uk: {
    gain: { self: "ви отримуєте", target: "обраний гравець отримує" },
    lose: { self: "ви втрачаєте", target: "обраний гравець втрачає" },
    change: { self: "ваш баланс змінюється на", target: "баланс обраного гравця змінюється на" },
  },
};

/** Points a source hands out or takes: "points equal to the dice result", "1 point for each item you hold". */
const SOURCE_POINTS: Record<Locale, Record<"diceSum" | "targetLastRoll", string>> = {
  en: { diceSum: "points equal to the dice result", targetLastRoll: "points equal to the chosen player's last roll" },
  ru: { diceSum: "столько очков, сколько выпало на кубиках", targetLastRoll: "столько очков, сколько выпало в последнем броске выбранного игрока" },
  uk: { diceSum: "стільки очок, скільки випало на кубиках", targetLastRoll: "стільки очок, скільки випало в останньому кидку обраного гравця" },
};

function balanceClause(locale: Locale, p: BalanceActionDoc, env: TextEnv): string {
  const who = p.to ?? "self";
  const words = BALANCE_WORDS[locale];
  if (isSourceValue(p.amount)) {
    const points = p.amount.source === "itemCount" ? sourceBy(locale, p.amount, NOUNS.point) : SOURCE_POINTS[locale][p.amount.source];
    return `${sourceUp(p.amount) ? words.gain[who] : words.lose[who]} ${points}`;
  }
  const r = rangeOf(p.amount, env);
  switch (direction(r)) {
    case "up":
      return `${words.gain[who]} ${nounAfter(locale, r, NOUNS.point)}`;
    case "down":
      return `${words.lose[who]} ${nounAfter(locale, r, NOUNS.point)}`;
    case "zero":
      return `${words.change[who]} 0`;
    default:
      return `${words.change[who]} ${span(r)} ${plural(locale, amount(r).hi, NOUNS.point)}`;
  }
}

// ---------------------------------------------------------------------------
// Lookup helpers — the rest of the DSL never indexes the tables directly
// ---------------------------------------------------------------------------

export function isConditionOp(op: string): op is ConditionOp {
  return Object.hasOwn(CONDITIONS, op);
}

export function isActionOp(op: string): op is ActionOp {
  return Object.hasOwn(ACTIONS, op);
}

/** The definition for a parsed condition, typed for it. */
export function conditionDef(c: ConditionDoc): ConditionDef<ConditionDoc> {
  return CONDITIONS[c.op] as unknown as ConditionDef<ConditionDoc>;
}

/** The definition for a parsed action, typed for it. */
export function actionDef(a: ActionDoc): ActionDef<ActionDoc> {
  return ACTIONS[a.op] as unknown as ActionDef<ActionDoc>;
}
