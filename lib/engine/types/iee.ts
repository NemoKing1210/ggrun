/**
 * Items / Effects / Events — domain types.
 *
 * See ITEMS_EFFECTS_EVENTS.md. Three layers, deliberately separated:
 *  - the catalog (ItemDef / EffectDef) is developer-authored TypeScript;
 *  - the season pool (IeeConfig) is admin-tuned JSONB on `seasons.config`;
 *  - runtime state (inventories, statuses) lives in tables and never here.
 *
 * Everything in this file is pure data or pure function shapes: the engine may
 * not touch the database, so an item "does" something by returning an intent
 * that the service layer executes inside a transaction.
 */

/** Which cell pool a thing drops from — NOT whether it helps its holder. */
export type Polarity = "positive" | "negative";

/**
 * The smallest thing a list surface needs to show "what is on this player" —
 * the leaderboard rows and the board roster.
 *
 * It lives here rather than beside the query that fills it because the board
 * is a client component: a type imported from the repository would name a
 * module that pulls in `pg`, and only `import type` keeps that out of the
 * browser bundle. A pure type cannot be got wrong that way.
 */
export type EffectBadge = { effectKey: string; polarity: Polarity };

/** Presentation shortcut over `weight`; see RARITY_WEIGHT. */
export type Rarity = "common" | "rare" | "epic" | "legendary";

export type ItemKey = string;
export type EffectKey = string;

/** Resolved parameters, snapshotted onto a row at grant time. */
export type IeeParams = Record<string, number | string | boolean>;

/** Read-only view of a participant, as the engine sees them. */
export interface IeePlayerSnapshot {
  seasonPlayerId: string;
  position: number;
  balancePoints: number;
  /** Monotonic count of resolved rolls — the clock for `rolls` durations. */
  rollSeq: number;
  /** Board moves made so far — gates `unlockAfterMove` and PvP protection. */
  moveCount: number;
  /** 1 = leader. Drives catch-up weighting. */
  rank: number;
  status: "active" | "finished" | "eliminated" | "withdrawn";
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type ItemUsageMode = "active" | "passive";

/** When an active item may be used. Narrower windows close timing exploits. */
export type ItemUseWindow = "anytime" | "before_roll" | "on_open_roll";

export type ItemTarget = "self" | "other" | "any" | "none";

export interface ItemUsage {
  mode: ItemUsageMode;
  window: ItemUseWindow;
  target: ItemTarget;
  charges: number;
  consumedOnUse: boolean;
}

export interface ItemUseContext {
  itemKey: ItemKey;
  params: IeeParams;
  actor: IeePlayerSnapshot;
  /** Null when `target` is "none"; equals `actor` for self-targeted items. */
  target: IeePlayerSnapshot | null;
}

export interface EffectGrantIntent {
  effectKey: EffectKey;
  /** seasonPlayerId of the recipient. */
  to: string;
  params?: IeeParams;
}

export interface ItemGrantIntent {
  itemKey: ItemKey;
  to: string;
  params?: IeeParams;
}

export interface BalanceIntent {
  to: string;
  delta: number;
  /** Written to `ledger_entries.reason` — reuse the ledger, never a second currency. */
  reason: string;
}

export interface CleanseIntent {
  from: string;
  /** Specific keys, or every effect matching `polarity`. */
  effectKeys: EffectKey[] | "all";
  polarity?: Polarity;
}

/**
 * What using an item asks the service to do. Pure: no writes happen here.
 * `rejected` carries an error code the action layer translates via
 * `errorText(t.core.errors, code)` — the domain never knows UI languages.
 */
export interface ItemUseResult {
  grantEffects?: EffectGrantIntent[];
  grantItems?: ItemGrantIntent[];
  balance?: BalanceIntent[];
  cleanse?: CleanseIntent[];
  feedPayload?: Record<string, unknown>;
  rejected?: string;
}

export interface ItemDef {
  /** Stable and persisted — never rename a shipped key, only deprecate it. */
  key: ItemKey;
  polarity: Polarity;
  rarity: Rarity;
  /**
   * Heroicon export name, e.g. "GiftIcon" — the same convention
   * GAME_POOL_TEMPLATES already uses. Commissioned artwork can be added
   * alongside later; a path to a file nobody has drawn is worse than none.
   */
  heroIcon: string;
  /** Dictionary keys, never literal text (AGENTS.md §7). */
  i18n: { name: string; description: string };
  usage: ItemUsage;
  defaults: IeeParams;
  apply(ctx: ItemUseContext): ItemUseResult;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Two grants of the same effect on one player. */
export type StackingPolicy = "unique" | "refresh" | "stack";

export type EffectDuration =
  | { kind: "permanent" }
  /** Expires after N further resolved rolls. Lazily evaluated — no scheduler. */
  | { kind: "rolls"; value: number }
  /** Expires after firing N times. */
  | { kind: "charges"; value: number };

/**
 * The closed set of points where an effect gets a say. Adding an effect to an
 * existing hook is trivial; adding a hook is an edit to the game loop — which
 * is exactly why this list is frozen up front (§12 D3).
 */
export type HookName =
  | "beforeGameRoll"
  | "onRollCreated"
  | "beforeMovement"
  | "afterMovement"
  | "beforeCellEffect"
  | "afterCellEffect"
  | "onOutcome"
  | "onTick"
  | "passive";

/** Turn data available at a hook; fields are absent outside their phase. */
export interface HookTurnContext {
  rollSeq: number;
  outcome?: "passed" | "dropped";
  diceResults?: number[];
  fromPosition?: number;
  toPosition?: number;
  balancePoints?: number;
  cellType?: string;
  cellConfig?: Record<string, unknown>;
}

export interface HookContext {
  hook: HookName;
  effectKey: EffectKey;
  params: IeeParams;
  /** The player this effect is attached to. */
  self: IeePlayerSnapshot;
  turn: HookTurnContext;
}

/**
 * One effect's contribution at one hook. Fields fall into three classes and
 * are reduced accordingly (see reduceHookPatches):
 *  - additive  — accumulate across effects;
 *  - override  — highest priority wins, conflicts are recorded;
 *  - veto      — boolean OR.
 */
export interface HookPatch {
  // additive
  stepsDelta?: number;
  balanceDelta?: number;
  diceCountDelta?: number;
  diceSidesDelta?: number;
  // override
  forcedPosition?: number;
  forcedOutcome?: "passed" | "dropped";
  // veto
  skipCellEffect?: boolean;
  immune?: boolean;
  // bookkeeping
  reason?: string;
  /** Ask the caller to spend one charge of this effect. */
  consumeCharge?: boolean;
}

export type HookFn = (ctx: HookContext) => HookPatch;

export interface EffectDef {
  key: EffectKey;
  polarity: Polarity;
  rarity: Rarity;
  /** Heroicon export name; see ItemDef.heroIcon. */
  heroIcon: string;
  i18n: { name: string; description: string };
  stacking: StackingPolicy;
  duration: EffectDuration;
  /** Lower runs first, and wins override conflicts. */
  priority: number;
  defaults: IeeParams;
  hooks: Partial<Record<HookName, HookFn>>;
}

/** An effect row as the engine sees it — projection of `player_effects`. */
export interface ActiveEffectLike {
  id: string;
  effectKey: EffectKey;
  params: IeeParams;
  chargesLeft: number | null;
  expiresAfterRollSeq: number | null;
  appliedAt: number;
}

/** The reduced outcome of every effect that spoke at one hook. */
export interface IeeModifiers {
  stepsDelta: number;
  balanceDelta: number;
  diceCountDelta: number;
  diceSidesDelta: number;
  forcedPosition: number | null;
  forcedOutcome: "passed" | "dropped" | null;
  skipCellEffect: boolean;
  immune: boolean;
  reasons: string[];
  /** Ids of effect rows that asked to spend a charge. */
  consumed: string[];
  /** Human-readable override conflicts, for the debug log. */
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// Season configuration (tier 2 — JSONB, no migrations)
// ---------------------------------------------------------------------------

/** Per-entry tuning. One shape for both items and effects. */
export interface IeeEntryConfig {
  enabled: boolean;
  weight: number;
  polarityOverride: Polarity | null;
  maxPerSeason: number | null;
  maxPerPlayer: number | null;
  cooldownRolls: number;
  minPosition: number;
  unlockAfterMove: number;
  paramOverrides: IeeParams;
  durationOverride: number | null;
  targetOverride: ItemTarget | null;
}

export interface IeeCatchUpConfig {
  enabled: boolean;
  /** Upper bound on the weight multiplier granted to a trailing player. */
  maxMultiplier: number;
}

export interface IeeConfig {
  /** Master switch. Off by default so existing seasons are untouched. */
  enabled: boolean;
  inventorySize: number;
  allowTargetingOthers: boolean;
  pvpProtectionMoves: number;
  revealDropsInFeed: boolean;
  /** Weight of the "nothing" wheel slice; 0 guarantees a drop. */
  nothingWeight: number;
  catchUp: IeeCatchUpConfig;
  /** Keyed by item or effect key. Absent key = not in this season's pool. */
  entries: Record<string, IeeEntryConfig>;
  /** Event template keys enabled for this season. */
  events: string[];
}

/** Default weight implied by a rarity, before admin overrides (§9.3). */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100,
  rare: 40,
  epic: 15,
  legendary: 5,
};

// ---------------------------------------------------------------------------
// Wheel
// ---------------------------------------------------------------------------

export type WheelOutcomeKind = "item" | "effect" | "nothing" | "fallback";

/** One slice of the wheel — returned to the client so it can show true odds. */
export interface WheelSlice {
  kind: WheelOutcomeKind;
  key: string | null;
  weight: number;
  /** Share of the wheel, 0..1. Rendering convenience; derived from weights. */
  share: number;
}

export interface WheelOutcome {
  kind: WheelOutcomeKind;
  key: string | null;
  params: IeeParams;
  polarity: Polarity;
  /** Every slice that was on the wheel, for the animation and the audit. */
  slices: WheelSlice[];
  /** Set when kind is "fallback": the cell's legacy numeric behaviour applies. */
  fallbackReason?: string;
}
