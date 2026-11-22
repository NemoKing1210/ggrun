/**
 * Items / Effects / Events — domain types.
 *
 * See docs/IEE_CONSTRUCTOR_SPEC.md. Three layers, deliberately separated:
 *  - the entries are documents, compiled by `lib/engine/iee/dsl` (its runtime
 *    types live there; this file holds what the rest of the app shares);
 *  - the season pool (IeeConfig) is admin-tuned JSONB on `seasons.config`;
 *  - runtime state (instances, the journal) lives in tables and never here.
 *
 * Everything in this file is pure data or pure function shapes: the engine may
 * not touch the database, so an entry "does" something by returning an intent
 * that the executor carries out inside a transaction.
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
export type EffectBadge = {
  effectKey: string;
  polarity: Polarity;
  /** The entry's name, so a badge renders without the catalog. */
  name: IeeLocaleText;
};

/** Presentation shortcut over `weight`; see RARITY_WEIGHT. */
export type Rarity = "common" | "rare" | "epic" | "legendary";

/** A text in every site language — entry names and rule text. */
export type IeeLocaleText = { ru: string; en: string; uk: string };

/**
 * What the client is told about an entry (docs/IEE_CONSTRUCTOR_SPEC.md §8).
 *
 * Plain data: client components receive it as props and never import the
 * engine's compiler or vocabulary. Numbers in `ruleText` are the season's —
 * its parameter and duration tuning already applied.
 */
export interface EntryView {
  revisionId: string;
  entryId: string;
  /** Stable key (the slug) — artwork and feed payloads use it. */
  key: string;
  kind: "item" | "effect";
  name: IeeLocaleText;
  ruleText: IeeLocaleText;
  flavor: IeeLocaleText | null;
  /** Heroicon name, or null for the kind's glyph. */
  glyph: string | null;
  character: "bonus" | "penalty";
  polarity: Polarity;
  rarity: Rarity;
  tags: readonly string[];
  /**
   * Items only. `charges` is the season's: an active item's uses, a passive or
   * cursed item's firings before it vanishes — null for a passive one that
   * stays while held.
   */
  usage: {
    activation: "active" | "passive" | "cursed";
    /** `after_dice`: a reaction item, used in the reaction window (wave B). */
    window: "anytime" | "before_roll" | "on_open_roll" | "after_dice";
    target: "self" | "other" | "any" | "none";
    charges: number | null;
    /** Who an aimed item may be aimed at, beyond a rival (wave A). */
    filter: TargetFilter | null;
    /** What a use asks the user to pick among their own instances (wave A `remove`). */
    choice: UseChoice | null;
    /** What a use asks the user to pick from the season's catalog (wave B `grantChosen`). */
    entryChoice: EntryChoice | null;
    /** What a use asks the user to pick for their next game (wave C `usage.pick`). */
    pick: PickKind | null;
    unique: boolean;
  } | null;
  /** Effects only, the season's count. `count` is null for permanent and instant ones, 1 for the next game. */
  duration: {
    unit: "instant" | "rolls" | "moves" | "passed_games" | "triggers" | "next_game" | "permanent";
    count: number | null;
  } | null;
  stacking: StackingPolicy | null;
  /** The triggers the entry's rules listen to, in rule order — staff surfaces show them. */
  triggers: readonly string[];
  /** How it is drawn — from the library, not the document (spec §12). */
  art: EntryArt;
}

/**
 * What the library knows about drawing an entry. The fallback chain (spec §12)
 * is the entry's icon, then the artwork shipped in `public/iee` (system pack
 * only), then the entry's glyph, then the pack's icon, then the kind's glyph.
 */
export interface EntryArt {
  /** The entry's own icon, uploaded to the library. */
  iconUrl: string | null;
  /** The pack's icon — drawn only for an entry with neither an icon nor a glyph. */
  packIconUrl: string | null;
  /** From the system pack, so the artwork shipped with the game may draw it. */
  system: boolean;
}

/** An entry the library knows nothing more about. */
export const NO_ART: EntryArt = { iconUrl: null, packIconUrl: null, system: false };

/**
 * An object standing on a cell, as the board shows it (wave D, spec §6.18):
 * the item that placed itself there, what it does to a move that enters the
 * cell, and whose it is. Plain data, like `EntryView`.
 */
export interface BoardObjectView {
  instanceId: string;
  cell: number;
  key: string;
  name: IeeLocaleText;
  /** The item's rule text, the season's numbers — what the object does. */
  ruleText: IeeLocaleText;
  glyph: string | null;
  polarity: Polarity;
  art: EntryArt;
  /** The player who placed it; null for one the season no longer knows. */
  owner: { username: string; displayName: string | null } | null;
}

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
  /**
   * Active players strictly behind — a condition's `rank: last` holds at 0
   * (wave A). Unknown when absent, and then "last" never holds.
   */
  behind?: number;
  /**
   * The dice sum of the player's last regular move — what «Магнит» compares
   * against (wave A, `compareLastRoll`, `targetLastRoll`). Null before their
   * first; unknown when absent.
   */
  lastRoll?: number | null;
  status: "active" | "finished" | "eliminated" | "withdrawn";
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * When an active item may be used. Narrower windows close timing exploits.
 * `after_dice` is a reaction item's: used in the reaction window, never from
 * the inventory (wave B, spec §6.15).
 */
export type ItemUseWindow = "anytime" | "before_roll" | "on_open_roll" | "after_dice";

export type ItemTarget = "self" | "other" | "any" | "none";

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Two grants of the same effect on one player. */
export type StackingPolicy = "unique" | "refresh" | "stack";

/**
 * The closed set of points where an effect gets a say. Adding an effect to an
 * existing hook is trivial; adding a hook is an edit to the game loop — which
 * is exactly why this list is frozen up front (§12 D3).
 */
export type HookName =
  | "beforeGameRoll"
  | "onRollCreated"
  | "beforeMovement"
  | "afterDice"
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
  /** The dice as thrown — at `afterDice` the first throw, from there on the faces that counted. */
  diceResults?: number[];
  /** The composition the dice were thrown with (`afterDice` on). */
  diceCount?: number;
  diceSides?: number;
  fromPosition?: number;
  toPosition?: number;
  balancePoints?: number;
  cellType?: string;
  cellConfig?: Record<string, unknown>;
}

/**
 * Something a rule asks the executor to do: hand out an entry, move points,
 * take effects away. The engine never writes, so a rule that does more than
 * nudge a number returns one of these and the service carries it out inside
 * its transaction (docs/IEE_CONSTRUCTOR_SPEC.md §9).
 *
 * Recipients are concrete participant ids — the rule resolved "self" and
 * "target" against the context it ran in.
 */
export type IeeIntent = (
  | {
      kind: "grant";
      /** Entry id; the season registry resolves it to the revision it plays. */
      entryId: string;
      /** The entry's key (slug), for logs and feed payloads. */
      key: string;
      entryKind: "item" | "effect";
      /** seasonPlayerId of the recipient. */
      to: string;
      /**
       * The player the item that handed it out was aimed at, when its user
       * keeps the effect: the effect's rules read them as "the chosen player"
       * at the turn's hooks (wave A, «Магнит»; spec §6.11).
       */
      aimedAt?: string;
      /**
       * What the use that handed it to its user picked (wave C, `usage.pick`,
       * spec §6.16): the effect remembers it, and `"picked"` reads it.
       */
      chosen?: UsePick;
    }
  | {
      kind: "balance";
      to: string;
      delta: number;
      /** Written to `ledger_entries.reason`. */
      reason: string;
    }
  | {
      kind: "cleanse";
      /** seasonPlayerId whose effects are removed. */
      from: string;
      /** Only effects of this character; null = any. */
      character: "bonus" | "penalty" | null;
      /** Only effects carrying at least one of these tags; empty = any. */
      tags: readonly string[];
      count: number | "all";
    }
  | MoveIntent
  | RemoveIntent
  | MoveItemsIntent
  | SwapItemsIntent
  | CopyItemIntent
  | DecideIntent
  | GameIntent
  | PlaceIntent
) &
  IntentHarm;

/**
 * The item being used places itself on a cell as a board object (wave D,
 * `placeObject`, spec §6.18): the executor checks the cell and the owner's
 * limit, and writes the object — the use's instance, held by the cell now.
 */
export interface PlaceIntent {
  kind: "place";
  /** seasonPlayerId of the user — the object's owner. */
  by: string;
  /** The board position the use picked. */
  cell: number;
  /** The item's key (slug), for logs and feed payloads. */
  key: string;
}

/**
 * The game a player has in flight (wave C, `rerollGame` / `postponeGame`, spec
 * §6.16): replaced by a new pick, or set aside to come back as their game
 * `afterRolls` picks later, counting the one now. The executor writes no
 * rolls: the game's item path carries it out, in the use's transaction.
 */
export interface GameIntent {
  kind: "game";
  how: "reroll" | "postpone";
  /** seasonPlayerId whose game it is — the item's user. */
  who: string;
  /** For a set-aside game, 2–4; null for a reroll. */
  afterRolls: number | null;
  /** The entry whose rule asked — for the journal and the feed. */
  key: string;
}

/**
 * Set on what an item's use does to the player it was aimed at when the
 * action harms them (D9): what protection answers (wave B, spec §6.13). The
 * compiler sets it; a rule never does.
 */
export interface IntentHarm {
  /** seasonPlayerId of the chosen player the action harms. */
  harmTo?: string;
}

/**
 * Items changing hands (wave B, `stealItem` / `transferItem`, spec §6.12):
 * random bonus items of `from` go to `to` — a participant, or a random active
 * rival of one — decided when it is carried out. The same instances move.
 */
export interface MoveItemsIntent {
  kind: "moveItems";
  from: string;
  to: string | { randomRivalOf: string };
  count: number;
  /** Only items of these rarities; null = any. */
  rarity: readonly Rarity[] | null;
  /** What the feed calls it: taken by the receiver, or handed over by the giver. */
  how: "stolen" | "given";
  /** The instance whose rule asked — an item never hands itself over. */
  except: string | null;
}

/** A trade (wave B, `swapItems`): one random bonus item of each to the other, both picked first. */
export interface SwapItemsIntent {
  kind: "swapItems";
  a: string;
  b: string;
  rarity: readonly Rarity[] | null;
  /** The instance whose rule asked — the item in use is not traded. */
  except: string | null;
}

/** A copy (wave B, `copyItem`): a fresh grant to `to` of a random bonus item `from` holds. */
export interface CopyItemIntent {
  kind: "copyItem";
  from: string;
  to: string;
  rarity: readonly Rarity[] | null;
  /** The instance whose rule asked — the item in use is not copied. */
  except: string | null;
}

/**
 * A choice put to a player (wave B, `victimChoice`, spec §6.14): they discard
 * `count` of their bonus items, the ones they choose — or, with `orKeep`, give
 * nothing and keep the instance that asked. The executor asks only when there
 * is a choice to make, and the question waits for the player (§7.6).
 */
export interface DecideIntent {
  kind: "decide";
  /** seasonPlayerId of whoever chooses — the holder of the rule. */
  who: string;
  count: number;
  orKeep: boolean;
  /** The instance whose rule asked: what `orKeep` keeps and giving ends. */
  instanceId: string | null;
  /** The entry whose rule asked — for the journal and the feed. */
  key: string;
}

/**
 * Taking instances away from a player (wave A, `remove`): the one chosen at
 * use, or the newest or random ones that match — decided when it is carried out.
 */
export interface RemoveIntent {
  kind: "remove";
  /** seasonPlayerId whose instances are removed. */
  from: string;
  what: "effect" | "item" | "any";
  character: "bonus" | "penalty" | null;
  /** Only instances of this entry; null = any. */
  entryId: string | null;
  /** Only instances of entries of these rarities; null = any (wave B). */
  rarity?: readonly Rarity[] | null;
  pick: { instanceId: string } | "newest" | "random";
  count: number;
}

/**
 * Who an out-of-turn move moves: a participant, or the active rival nearest
 * behind one — decided when the move is carried out, since positions change.
 */
export type MoveWho = string | { nearestBehind: string };

/**
 * Where an out-of-turn move goes (spec §7.3), decided when it is carried out:
 * a number of cells (signed), a player's cell or the cell right before it,
 * the cell their last regular move started from, half the gap to a player
 * ahead, or someone else's place — they take the mover's.
 */
export type MoveTo =
  | { by: number }
  | { player: string; at: "cell" | "before" }
  | { lastMoveStart: true }
  | { halfwayTo: string }
  | { swapWith: MoveWho };

/** Who an aimed item may be aimed at (spec §6.10). */
export type TargetFilter = "ahead" | "behind" | "nearest_ahead" | "nearest_behind" | "leader";

/** The instances of their own a use asks the user to pick one of (spec §6.10). */
export interface UseChoice {
  what: "effect" | "item" | "any";
  character: "bonus" | "penalty" | null;
  /** Only instances of this entry; null = any. */
  entryId: string | null;
  /** Only instances of entries of these rarities; null = any (wave B). */
  rarity: readonly Rarity[] | null;
}

/**
 * The entry of the season's catalog a use asks the user to pick (wave B,
 * `grantChosen`, spec §6.12): a bonus item attached and switched on, of these
 * rarities and this activation — null for any.
 */
export interface EntryChoice {
  rarity: readonly Rarity[] | null;
  activation: "active" | "passive" | null;
}

/**
 * What a use may ask its user to pick: for their next game (wave C, `usage.pick`,
 * spec §6.16), or the cell the item places itself on (wave D, spec §6.18).
 */
export const PICK_KINDS = ["genre", "years", "game", "cell"] as const;
export type PickKind = (typeof PICK_KINDS)[number];

/**
 * What a use picked (wave C, spec §6.16): a genre (the catalog's, lowercase), a
 * decade of release years, or a game of the season's pool. The effect the use
 * hands its user remembers it (`iee_instances.chosen`, §4.3): it is what
 * `"picked"` reads at `beforeGameRoll`. A cell (wave D, §6.18) is where the
 * item places itself — a board position the season's board offers.
 */
export type UsePick = { genre: string } | { years: [number, number] } | { gameId: string; title: string } | { cell: number };

/** A pick as the user's form sends it, before the season says it offers it (wave C, spec §6.16; a cell, wave D). */
export type PickRequest = { genre: string } | { years: [number, number] } | { gameId: string } | { cell: number };

/** Which kind of pick it is. */
export function pickKindOf(pick: UsePick | PickRequest): PickKind {
  if ("genre" in pick) return "genre";
  if ("years" in pick) return "years";
  if ("cell" in pick) return "cell";
  return "game";
}

/**
 * The games a rule at `beforeGameRoll` names (wave C, spec §6.16), as it read
 * them: a game matches when one of its genres is in `genres`, it was released
 * within `years`, and its rating is within `rating` — each that is given. A
 * bound left null is open.
 */
export interface GameMatch {
  /** Lowercase genre names. */
  genres?: readonly string[];
  years?: { min: number | null; max: number | null };
  rating?: { min: number | null; max: number | null };
}

/** What one firing of a rule at `beforeGameRoll` does to its holder's next game (wave C, spec §6.16). */
export type PoolContribution =
  | { kind: "exclude"; match: GameMatch }
  | { kind: "require"; match: GameMatch }
  | { kind: "favor"; gameId: string; factor: number }
  /** The draw offers `n` games and the holder takes one (`chooseOfN`, spec §7.12). */
  | { kind: "choose"; n: number };

/** A position change out of turn: no cell fires, no wheel spins, no `moves` counter goes down. */
export interface MoveIntent {
  kind: "move";
  who: MoveWho;
  to: MoveTo;
  /** The entry whose rule asked — for the journal and the feed. */
  key: string;
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
  /** Added to the dice result (spec §7.2 step 5). */
  resultDelta?: number;
  // the dice pipeline (spec §7.2): faces thrown again, a second throw, a cap, the sign
  /** A die showing one of these is thrown again, once. */
  rerollValues?: number[];
  /** The dice are thrown twice and the throw better for the player counts. */
  bestOfTwo?: boolean;
  /** The dice are thrown twice and the throw worse for the player counts. */
  worstOfTwo?: boolean;
  /** The dice result is at most this — the lowest cap wins. */
  resultCap?: number;
  /** The lower half of the dice range moves the player back, the upper half forward. */
  reverseLowerHalf?: boolean;
  // override
  forcedPosition?: number;
  forcedOutcome?: "passed" | "dropped";
  // veto
  skipCellEffect?: boolean;
  immune?: boolean;
  /** The regular move is cancelled: the token stays where it was. */
  cancelMove?: boolean;
  // executor work, collected in order
  intents?: IeeIntent[];
  /** The wheels to spin once more this turn, after the landing's own (wave B, `extraSpin`). */
  extraSpins?: Polarity[];
  // bookkeeping
  reason?: string;
  /** Ask the caller to spend one charge of this effect. */
  consumeCharge?: boolean;
}

/** The reduced outcome of every effect that spoke at one hook. */
export interface IeeModifiers {
  stepsDelta: number;
  balanceDelta: number;
  diceCountDelta: number;
  diceSidesDelta: number;
  resultDelta: number;
  /** Faces thrown again, once each — the union of every source's. */
  rerollValues: number[];
  bestOfTwo: boolean;
  worstOfTwo: boolean;
  /** The lowest cap asked for; null = none. */
  resultCap: number | null;
  reverseLowerHalf: boolean;
  forcedPosition: number | null;
  forcedOutcome: "passed" | "dropped" | null;
  skipCellEffect: boolean;
  immune: boolean;
  cancelMove: boolean;
  /** Every intent the hook produced, in reduction order. */
  intents: IeeIntent[];
  /** Wheels to spin once more this turn, in reduction order (wave B). */
  extraSpins: Polarity[];
  reasons: string[];
  /** Ids of the instances that asked to spend a charge. */
  consumed: string[];
  /** Human-readable override conflicts, for the debug log. */
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// Season configuration (tier 2 — JSONB, no migrations)
// ---------------------------------------------------------------------------

/**
 * Per-entry tuning as the wheel reads it. One shape for both items and
 * effects; a season's catalog row (`SeasonCatalogEntry`) is folded into it.
 */
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
  /** Event template keys enabled for this season. */
  events: string[];
  /** Cap on active effects per player; null = no cap (spec §4.5). */
  maxActiveEffectsPerPlayer: number | null;
  /** Active instances per player carrying a tag, by tag. */
  tagLimits: Record<string, number>;
  /** Tags removed from the season entirely: such entries neither drop nor are granted. */
  disabledTags: string[];
  /** Highest power an attached revision should have — a warning in the wizard, not a block. */
  powerCeiling: number | null;
  /** Board objects a player may have placed at once (§7.7; wave D). */
  boardObjectsPerPlayer: number;
}

/**
 * One row of a season's catalog (`season_catalog`, spec §4.2): the revision a
 * season plays of an entry, and the season's tuning of it. Which entries a
 * season plays lives here, not in `seasons.config`.
 */
export interface SeasonCatalogEntry {
  entryId: string;
  revisionId: string;
  /** Drops from the wheel. A disabled row stays attached — another entry may hand it out. */
  enabled: boolean;
  /** The wheel it drops from: the revision's character unless the season moves it. */
  pool: "bonus" | "penalty";
  /** Overrides the revision's rarity for catch-up and the default weight. */
  rarity: Rarity | null;
  weight: number;
  maxPerSeason: number | null;
  maxPerPlayer: number | null;
  cooldownRolls: number;
  minPosition: number;
  unlockAfterMove: number;
  paramOverrides: IeeParams;
  /** Effects: the duration's count; items: the charges. */
  durationOverride: number | null;
  targetOverride: ItemTarget | null;
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
