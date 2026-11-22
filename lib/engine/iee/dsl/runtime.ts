/**
 * What the compiler produces and what the game runs (spec §8).
 *
 * A compiled entry keeps the document it came from and adds the closures the
 * turn and the item path call. Compilation selects and parameterises code from
 * the vocabulary; nothing in a document is ever evaluated as code.
 */
import type {
  HookName,
  HookPatch,
  HookTurnContext,
  IeeIntent,
  IeeParams,
  IeePlayerSnapshot,
  PickKind,
  Polarity,
  PoolContribution,
  Rarity,
  TargetFilter,
  UseChoice,
  UsePick,
  EntryChoice,
} from "../../types/iee";
import type { ReactionRules } from "../../turn/reaction";
import type {
  Character,
  DurationUnit,
  EntryDoc,
  EntryKind,
  Localized,
  LocalizedText,
  ParamDecl,
} from "./doc";

/** Triggers of vocabulary v1 (spec §6.1) this build carries. */
export const TRIGGER_NAMES = [
  "onUse",
  "onPickup",
  "onApply",
  "onExpire",
  "beforeMovement",
  "afterDice",
  "afterMovement",
  "beforeCellEffect",
  "afterCellEffect",
  "onOutcome",
  "onTick",
  "onIncoming",
  "whileActive",
  "beforeGameRoll",
  "onRollCreated",
  "onObjectEntered",
  "onSameCell",
] as const;
export type TriggerName = (typeof TRIGGER_NAMES)[number];

/** Where a primitive lands: `1` = the core stage, letters = the waves. */
export type Stage = 1 | "A" | "B" | "C" | "D";

/** What the engine knows about an entry without compiling it — for references. */
export interface EntryFacts {
  entryId: string;
  slug: string;
  kind: EntryKind;
  character: Character;
  tags: readonly string[];
  name: Localized;
}

/**
 * What is about to reach a player (wave B, spec §6.13): an action a rival's
 * item aims at them that harms them, an entry handed to them, an out-of-turn
 * move that would take them back. What `onIncoming` rules see.
 */
export interface ArrivalView {
  is: "harm" | "entry" | "moveBack";
  /** The entry arriving, for `entry`; null otherwise. */
  entry: EntryFacts | null;
}

/** How a rule at `onIncoming` answers what arrives (wave B, spec §6.13). */
export type IncomingAnswer =
  | { kind: "block" }
  | { kind: "reflect" }
  | { kind: "amplify"; factor: number }
  | { kind: "replace"; with: number };

/** What a rule at `whileActive` says holds while its instance lasts (wave B, spec §6.13). */
export interface StandingAnswer {
  /** Rivals cannot aim items at the holder. */
  untargetable: boolean;
  /** The holder cannot use items. */
  forbidItems: boolean;
  /** Harmful actions aimed at the holder pierce protection up to this tier. */
  pierce: number;
  /**
   * The most bonus items the holder may hold — over it they choose which to
   * keep, the rest burn (wave B, `holdLimit`, spec §6.14); null for no limit.
   */
  holdLimit: number | null;
  /** The holder's games get no completion conditions (wave C, `conditionImmunity`, spec §6.17). */
  conditionImmunity: boolean;
}

/**
 * The holder's games, as a rule at `beforeGameRoll` reads them (wave C, spec
 * §6.16): the genres of the last game they passed, and of every game they
 * passed this season — lowercase.
 */
export interface GamesView {
  /** Null when they have passed no game yet. */
  lastPassed: readonly string[] | null;
  passed: readonly string[];
}

/** Resolves a reference to the entry the season plays, or null when it has none. */
export type ResolveEntry = (entryId: string) => EntryFacts | null;

/** Everything a rule may look at while it runs. */
export interface RuleContext {
  trigger: TriggerName;
  /** Parameter snapshot of the instance (defaults with the season's overrides). */
  params: IeeParams;
  /** The holder of an effect, the user of an item. */
  self: IeePlayerSnapshot;
  /**
   * The chosen player of an item at its use; at the turn's hooks, the player
   * the item that handed an effect out was aimed at (spec §6.11); null
   * everywhere else.
   */
  target: IeePlayerSnapshot | null;
  /** Turn data at turn hooks; null at `onUse`, `onApply`, `onExpire`. */
  turn: HookTurnContext | null;
  /** What `self` holds and suffers right now — `hasEntry` reads it. */
  selfEntries: readonly EntryFacts[];
  /** The same for `target`. */
  targetEntries: readonly EntryFacts[];
  /** Server randomness. Never `Math.random` inside the engine. */
  rng: () => number;
  /** The instance the user picked when using the item (`remove` with `pick: choice`); absent elsewhere. */
  choice?: string | null;
  /** The entry of the season's catalog the user picked as they used the item (`grantChosen`, wave B). */
  entryChoice?: string | null;
  /**
   * The instance whose rule runs — the item used, the item held, the effect.
   * An item operation leaves it where it is (wave B, spec §6.12); unknown when absent.
   */
  instanceId?: string | null;
  /** What is about to reach the holder, at `onIncoming` (wave B, spec §6.13); absent elsewhere. */
  arrival?: ArrivalView | null;
  /**
   * What the user picked as they used the item (wave C, `usage.pick`, spec
   * §6.16) — at `onUse`; what an effect handed to its user remembers.
   */
  pick?: UsePick | null;
  /** What the use that handed this effect out picked, at `beforeGameRoll` (wave C); absent elsewhere. */
  chosen?: UsePick | null;
  /** The holder's games, at `beforeGameRoll` (wave C, spec §6.16); absent elsewhere. */
  games?: GamesView | null;
}

/** What a firing rule contributes, before it becomes a patch or a list of intents. */
export interface RuleOutput {
  stepsDelta: number;
  diceCountDelta: number;
  diceSidesDelta: number;
  balanceDelta: number;
  /** The dice pipeline (spec §7.2): faces thrown again, a second throw, the result, its sign. */
  rerollValues: number[];
  bestOfTwo: boolean;
  worstOfTwo: boolean;
  /** A reaction item's throw again: the new throw stands (wave B, `reroll`, spec §6.15). */
  rerollAll: boolean;
  resultDelta: number;
  resultCap: number | null;
  reverseLowerHalf: boolean;
  skipCellEffect: boolean;
  cancelMove: boolean;
  intents: IeeIntent[];
  /** Wheels to spin once more this turn (wave B, `extraSpin`). */
  extraSpins: Polarity[];
  /** How a rule at `onIncoming` answers what arrives; null when none of its actions does (wave B). */
  answer: IncomingAnswer | null;
  /** What a rule at `whileActive` says holds (wave B). */
  untargetable: boolean;
  forbidItems: boolean;
  pierce: number;
  /** The fewest bonus items a rule at `whileActive` lets the holder keep; null for none (wave B, `holdLimit`). */
  holdLimit: number | null;
  /** What a rule at `beforeGameRoll` does to the holder's next game (wave C, spec §6.16). */
  pool: PoolContribution[];
  /** The completion conditions a rule at `onRollCreated` gives the holder's game (wave C, spec §6.17). */
  conditions: Localized[];
  /** What a rule at `whileActive` says of completion conditions (wave C). */
  conditionImmunity: boolean;
  /** What a board object does to the mover who entered its cell (wave D, `onObjectEntered`, spec §6.18). */
  object: ObjectAnswer;
  /** The rival whose move ended on the holder's cell takes the item (wave D, `takeEntry`, spec §6.19). */
  take: boolean;
}

/**
 * What a board object does to the mover whose regular move entered its cell
 * (wave D, spec §6.18): the move stops there, then the mover is pushed; or it
 * goes further; a wheel spins in place of the cell.
 */
export interface ObjectAnswer {
  stop: boolean;
  /** Cells the mover is moved after a stop: back when negative. */
  push: number;
  /** Cells the move goes further, in its own direction. */
  extend: number;
  /** The wheel that spins in place of the cell; null for none. */
  spin: Polarity | null;
}

export function emptyRuleOutput(): RuleOutput {
  return {
    stepsDelta: 0,
    diceCountDelta: 0,
    diceSidesDelta: 0,
    balanceDelta: 0,
    rerollValues: [],
    bestOfTwo: false,
    worstOfTwo: false,
    rerollAll: false,
    resultDelta: 0,
    resultCap: null,
    reverseLowerHalf: false,
    skipCellEffect: false,
    cancelMove: false,
    intents: [],
    extraSpins: [],
    answer: null,
    untargetable: false,
    forbidItems: false,
    pierce: 0,
    holdLimit: null,
    pool: [],
    conditions: [],
    conditionImmunity: false,
    object: { stop: false, push: 0, extend: 0, spin: null },
    take: false,
  };
}

/** One rule of an effect, bound to the turn hook its trigger maps to. */
export interface CompiledHookRule {
  /** Index into `doc.rules` — journaled as `rule_index`. */
  ruleIndex: number;
  /** 50 / 100 / 200 — orders the reduction (spec §7.1). */
  priority: number;
  /** The patch when the rule fires; null when a condition did not hold. */
  run(ctx: RuleContext): HookPatch | null;
}

/** A rule run by the executor rather than the turn: `onApply`, `onExpire`, `onPickup`. */
export interface CompiledEventRule {
  ruleIndex: number;
  run(ctx: RuleContext): IeeIntent[] | null;
}

/** A rule at `onIncoming` (wave B, spec §6.13): its answer to what arrives, when its conditions hold. */
export interface CompiledIncomingRule {
  ruleIndex: number;
  run(ctx: RuleContext): IncomingAnswer | null;
}

/** A rule at `whileActive` (wave B, spec §6.13): what holds while its instance lasts, when its conditions do. */
export interface CompiledStandingRule {
  ruleIndex: number;
  run(ctx: RuleContext): StandingAnswer | null;
}

/** A rule at `beforeGameRoll` (wave C, spec §6.16): what it does to the holder's next game, when its conditions hold. */
export interface CompiledPoolRule {
  ruleIndex: number;
  run(ctx: RuleContext): PoolContribution[] | null;
}

/** A rule at `onRollCreated` (wave C, spec §6.17): the completion conditions it gives the game, when its conditions hold. */
export interface CompiledRollRule {
  ruleIndex: number;
  run(ctx: RuleContext): Localized[] | null;
}

/**
 * A rule at `onSameCell` (wave D, spec §6.19) — an effect's, a passive or
 * cursed item's: what it asks when a rival's regular move ends on its holder's
 * cell, and whether that rival takes the item; null when its conditions do not
 * hold.
 */
export interface CompiledSameCellRule {
  ruleIndex: number;
  run(ctx: RuleContext): { intents: IeeIntent[]; take: boolean } | null;
}

/** A rule at `onObjectEntered` (wave D, spec §6.18): what the object does to the mover, when its conditions hold. */
export interface CompiledObjectRule {
  ruleIndex: number;
  run(ctx: RuleContext): ObjectAnswer | null;
}

export interface CompiledBase {
  entryId: string;
  revisionId: string;
  /** Stable, persisted key — the slug. Stage 1 keeps the catalog's old keys. */
  key: string;
  slug: string;
  kind: EntryKind;
  name: Localized;
  /** Name in every locale, `ru` filling the gaps. */
  names: LocalizedText;
  flavor: LocalizedText | null;
  /** Generated from the rules — can never contradict them (spec §13). */
  ruleText: LocalizedText;
  character: Character;
  /** `character` in the vocabulary of the wheel and the badges. */
  polarity: Polarity;
  rarity: Rarity;
  tags: readonly string[];
  /** Heroicon name for the icon fallback chain; null = glyph by kind. */
  glyph: string | null;
  params: Readonly<Record<string, ParamDecl>>;
  /** Declared defaults — what an instance gets before the season's overrides. */
  defaults: IeeParams;
  /** The tier its `block` and `reflect` hold against a harmful action's pierce: 1 unless set (wave B, §6.13). */
  protectionTier: 1 | 2;
  /** Rules at `onIncoming` — an effect's, a passive or cursed item's (wave B). */
  incoming: CompiledIncomingRule[];
  /** Rules at `whileActive` — an effect's, a passive or cursed item's (wave B). */
  standing: CompiledStandingRule[];
  /** Rules at `beforeGameRoll` — an effect's, a passive or cursed item's (wave C). */
  pool: CompiledPoolRule[];
  /** Rules at `onRollCreated` — an effect's, a passive or cursed item's (wave C). */
  rollCreated: CompiledRollRule[];
  /** Rules at `onSameCell` — an effect's, a passive or cursed item's (wave D). */
  sameCell: CompiledSameCellRule[];
  doc: EntryDoc;
}

export interface CompiledUsage {
  /** Used by its holder, working while held, or working by itself and unusable (spec §6.10). */
  activation: "active" | "passive" | "cursed";
  /**
   * When an active item may be used; `anytime` for the others, which are never
   * used. `after_dice`: a reaction item, used in the reaction window (wave B, §6.15).
   */
  window: "anytime" | "before_roll" | "on_open_roll" | "after_dice";
  /** Whom an active item is aimed at; `none` for the others. */
  target: "self" | "other" | "any" | "none";
  /**
   * An active item's uses; a passive or cursed item's firings before it
   * vanishes — null for a passive one that stays while held.
   */
  charges: number | null;
  /** At most one per holder — cursed items always, and an item one in the season. */
  unique: boolean;
  /**
   * One in the season (wave D, `usage.unique: "season"`, spec §6.19): once one
   * has been handed out, nothing hands out another — it changes hands.
   */
  seasonUnique: boolean;
  /** Who an aimed item may be aimed at, beyond a rival. */
  filter: TargetFilter | null;
  /** What a use asks the user to pick among their own instances. */
  choice: UseChoice | null;
  /** What a use asks the user to pick from the season's catalog (wave B). */
  entryChoice: EntryChoice | null;
  /** What a use asks the user to pick for their next game (wave C, spec §6.16). */
  pick: PickKind | null;
}

/** What using an item asks for. Pure: the service carries it out. */
export interface ItemUseOutcome {
  intents: IeeIntent[];
  /** Error code for the action layer to translate; nothing happens when set. */
  rejected?: string;
  /** Extra fields for the `item_used` feed row. */
  feedPayload: Record<string, unknown>;
}

export interface ItemUseInput {
  params: IeeParams;
  actor: IeePlayerSnapshot;
  /** Null when the item names no target; equals `actor` for self-targeted items. */
  target: IeePlayerSnapshot | null;
  actorEntries: readonly EntryFacts[];
  targetEntries: readonly EntryFacts[];
  rng: () => number;
  /** The instance the user picked, for an item that asks for one (`usage.choice`). */
  choice?: string | null;
  /** The entry the user picked from the season's catalog, for an item that asks for one (`usage.entryChoice`). */
  entryChoice?: string | null;
  /** The held instance being used — an item operation never hands it over or copies it. */
  instanceId?: string | null;
  /** What the user picked for their next game, for an item that asks (`usage.pick`, wave C). */
  pick?: UsePick | null;
}

/** What a reaction item's rules read in the reaction window (wave B, spec §6.15). */
export interface ReactInput {
  params: IeeParams;
  actor: IeePlayerSnapshot;
  /** The turn as `afterDice` sees it: the throw, the outcome, the dice. */
  turn: HookTurnContext;
  actorEntries: readonly EntryFacts[];
  rng: () => number;
  instanceId?: string | null;
}

export interface CompiledItem extends CompiledBase {
  kind: "item";
  usage: CompiledUsage;
  use(input: ItemUseInput): ItemUseOutcome;
  /**
   * A reaction item's answer to the throw (wave B, spec §6.15): what its `onUse`
   * rules whose conditions hold ask of the dice; null when none holds. Absent
   * for every other item.
   */
  react?: (input: ReactInput) => ReactionRules | null;
  /**
   * A passive or cursed item's rules at the turn hooks: they act while it is
   * held, as an effect's do. Empty for an active item.
   */
  hooks: Partial<Record<HookName, CompiledHookRule[]>>;
  /** Rules run as the item arrives in an inventory. */
  onPickup: CompiledEventRule[];
  /**
   * What the item does once it stands on the board and a regular move enters
   * its cell (wave D, spec §6.18) — an active item that places itself. Empty
   * for every other item.
   */
  objectEntered: CompiledObjectRule[];
}

export interface CompiledDuration {
  /**
   * `instant`: the effect acts once, on arrival, and no instance stays;
   * `next_game`: it ends when the holder's next game is resolved (spec §6.4).
   */
  unit: DurationUnit;
  /** Null for `permanent` and `instant`; 1 for `next_game`. */
  count: number | null;
}

export interface CompiledStacking {
  mode: "unique" | "refresh" | "stack";
  /** Concurrent instances allowed under `stack`; null = no cap. */
  maxStacks: number | null;
}

export interface CompiledEffect extends CompiledBase {
  kind: "effect";
  /** It moves the nearest rival behind its holder on arrival: pointless for a holder with nobody behind. */
  needsBehind: boolean;
  duration: CompiledDuration;
  stacking: CompiledStacking;
  /** Turn hooks, rules in document order (the reducer sorts by priority). */
  hooks: Partial<Record<HookName, CompiledHookRule[]>>;
  onApply: CompiledEventRule[];
  onExpire: CompiledEventRule[];
}

export type CompiledEntry = CompiledItem | CompiledEffect;

export function isItem(entry: CompiledEntry): entry is CompiledItem {
  return entry.kind === "item";
}

export function isEffect(entry: CompiledEntry): entry is CompiledEffect {
  return entry.kind === "effect";
}

/** The facts other entries see when they reference this one. */
export function factsOf(entry: CompiledEntry): EntryFacts {
  return {
    entryId: entry.entryId,
    slug: entry.slug,
    kind: entry.kind,
    character: entry.character,
    tags: entry.tags,
    name: entry.name,
  };
}
