/**
 * The entry document, DSL v1 — the shape of an item or an effect as data.
 *
 * Normative: docs/IEE_CONSTRUCTOR_SPEC.md §5. This file is the structure only;
 * which triggers, conditions and actions exist is the vocabulary's business
 * (`vocabulary.ts`), so a rule is validated in two steps: the frame here, then
 * each `op` against its own schema. Splitting it that way turns "unknown
 * operation `teleport`" into its own error instead of a wall of union noise.
 */
import { z } from "zod";

import { PICK_KINDS } from "../../types/iee";
import { SCENARIO_GAME_KEYS } from "./scenario-games";

export const DSL_VERSION = 1 as const;

export const LOCALES = ["ru", "en", "uk"] as const;
export type Locale = (typeof LOCALES)[number];

export const ENTRY_KINDS = ["item", "effect"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const CHARACTERS = ["bonus", "penalty"] as const;
/** Good or bad *for whoever receives the entry* — decides the drop pool (D9). */
export type Character = (typeof CHARACTERS)[number];

export const RARITIES = ["common", "rare", "epic", "legendary"] as const;

export const DURATION_UNITS = [
  "instant",
  "rolls",
  "moves",
  "passed_games",
  "triggers",
  "next_game",
  "permanent",
] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/** Units that need a `count`. */
export const COUNTED_UNITS: ReadonlySet<DurationUnit> = new Set([
  "rolls",
  "moves",
  "passed_games",
  "triggers",
]);

export const RULE_PRIORITY = { early: 50, normal: 100, late: 200 } as const;
export type RulePriority = keyof typeof RULE_PRIORITY;

/** Board cell types a rule may name. Mirrors the `cell_type` database enum. */
export const CELL_TYPES = [
  "start",
  "finish",
  "normal",
  "penalty",
  "event",
  "bonus",
  "teleport",
  "custom",
] as const;
export type CellType = (typeof CELL_TYPES)[number];

/** Upper bounds that keep a document from being a denial-of-service vector. */
export const LIMITS = {
  rules: 16,
  conditionsPerRule: 8,
  /** Engine invariant (spec §7.10): at most eight actions per firing. */
  actionsPerRule: 8,
  tags: 12,
  params: 12,
  nameLength: 60,
  flavorLength: 400,
  /** Entry scenarios (§5.5): how many, how long, how much each sets up and checks. */
  scenarios: 20,
  scenarioSteps: 12,
  scenarioTitleLength: 120,
  scenarioCarries: 8,
  scenarioHoldings: 8,
  /** A completion condition's text, in each language (wave C, spec §6.17). */
  conditionTextLength: 200,
} as const;

export const SLUG_RE = /^[a-z0-9_]{2,48}$/;
export const TAG_RE = /^[a-z0-9_]{1,32}$/;
export const PARAM_NAME_RE = /^[a-z][a-zA-Z0-9_]{0,31}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const text = (max: number) => z.string().trim().min(1).max(max);

/** `ru` is the content language and is required; the others fall back to it. */
export const LocalizedSchema = (max: number) =>
  z.strictObject({ ru: text(max), en: text(max).optional(), uk: text(max).optional() });
export type Localized = { ru: string; en?: string; uk?: string };
/** Every locale filled in — what fallback and the rule-text generator produce. */
export type LocalizedText = Record<Locale, string>;

/** A reference to another entry: by entry id, never by revision (D11). */
export const EntryRefSchema = z.strictObject({
  entry: z.string().regex(UUID_RE, "an entry id (uuid)"),
  /** Readability only — resolution never looks at it. */
  slug: z.string().regex(SLUG_RE).optional(),
});
export type EntryRef = z.infer<typeof EntryRefSchema>;

const IntParam = z
  .strictObject({
    type: z.literal("int"),
    default: z.number().int(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  })
  .refine((p) => p.min === undefined || p.max === undefined || p.min <= p.max, {
    message: "min must not exceed max",
  })
  .refine((p) => (p.min === undefined || p.default >= p.min) && (p.max === undefined || p.default <= p.max), {
    message: "default is outside min..max",
  });
const BoolParam = z.strictObject({ type: z.literal("bool"), default: z.boolean() });
const EnumParam = z
  .strictObject({
    type: z.literal("enum"),
    default: z.string().min(1),
    values: z.array(z.string().min(1)).min(1).max(32),
  })
  .refine((p) => p.values.includes(p.default), { message: "default is not one of values" });

/** A season-tunable value (§5.1). The only thing a season may override. */
export const ParamDeclSchema = z.union([IntParam, BoolParam, EnumParam]);
export type ParamDecl = z.infer<typeof ParamDeclSchema>;

export const UsageSchema = z.strictObject({
  activation: z.enum(["active", "passive", "cursed"]),
  window: z.enum(["anytime", "before_roll", "after_dice", "on_open_roll"]).optional(),
  target: z
    .strictObject({
      who: z.enum(["self", "other", "any", "none"]),
      filter: z.enum(["ahead", "behind", "nearest_ahead", "nearest_behind", "leader"]).optional(),
    })
    .optional(),
  charges: z.number().int().min(1).max(99).optional(),
  /** At most one per holder; `"season"` — one in the season, changing hands (wave D, spec §6.19). */
  unique: z.union([z.boolean(), z.literal("season")]).optional(),
  /** What the user picks for their next game as they use it (wave C, spec §6.16). */
  pick: z.enum(PICK_KINDS).optional(),
});
export type UsageDoc = z.infer<typeof UsageSchema>;

/** Release years a rule or a pick may name (wave C, spec §6.16). */
export const YEAR_BOUNDS = { min: 1970, max: 2100 } as const;
const YearSchema = z.number().int().min(YEAR_BOUNDS.min).max(YEAR_BOUNDS.max);

/** A genre as the catalog names it — lowercase (wave C, spec §6.16). */
export const GenreSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .refine((genre) => genre === genre.toLowerCase(), { message: "a genre is lowercase" });

/**
 * What a use picked (wave C, spec §6.16) — what `iee_instances.chosen` holds:
 * a genre, a span of release years, or a game with its title.
 */
export const UsePickSchema = z.union([
  z.strictObject({ genre: GenreSchema }),
  z.strictObject({
    years: z.tuple([YearSchema, YearSchema]).refine(([from, to]) => from <= to, { message: "years run from the first to the second" }),
  }),
  z.strictObject({ gameId: z.string().regex(UUID_RE, "a game id (uuid)"), title: z.string().trim().min(1).max(200) }),
  // The cell an item placed itself on (wave D, spec §6.18): a board position.
  z.strictObject({ cell: z.number().int().min(0).max(999) }),
]);

export const DurationSchema = z.strictObject({
  unit: z.enum(DURATION_UNITS),
  count: z.number().int().min(1).max(99).optional(),
});
export type DurationDoc = z.infer<typeof DurationSchema>;

export const StackingSchema = z.strictObject({
  mode: z.enum(["unique", "refresh", "stack"]),
  maxStacks: z.number().int().min(1).max(99).optional(),
  group: z.string().regex(TAG_RE).optional(),
});
export type StackingDoc = z.infer<typeof StackingSchema>;

/** `{ op, ...params }` — the op's own schema validates the rest. */
export const OpSchema = z.looseObject({ op: z.string().min(1).max(48) });
export type OpDoc = z.infer<typeof OpSchema>;

export const RuleSchema = z.strictObject({
  when: z.string().min(1).max(48),
  if: z.array(OpSchema).max(LIMITS.conditionsPerRule).optional(),
  do: z.array(OpSchema).min(1).max(LIMITS.actionsPerRule),
  priority: z.enum(["early", "normal", "late"]).optional(),
});
export type RuleDoc = z.infer<typeof RuleSchema>;

// ---------------------------------------------------------------------------
// Entry scenarios (§5.5) — Given / When / Then, run on publish
// ---------------------------------------------------------------------------

export const SCENARIO_ID_RE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;

/** What a use may be refused with — the item path's own codes (`core.errors`). */
export const USE_REFUSALS = [
  "ieeItemNotFound",
  "ieeItemAlreadyUsed",
  "ieeItemNotUsable",
  "ieeItemWrongWindow",
  "ieeTargetRequired",
  "ieeTargetSelfNotAllowed",
  "ieeTargetNotActive",
  "ieeTargetingDisabled",
  "ieeTargetProtected",
  "ieeTargetAlreadyAffected",
  "ieeTargetNotEligible",
  "ieeChoiceRequired",
  "ieeChoiceInvalid",
  "ieeEntryChoiceRequired",
  "ieeEntryChoiceInvalid",
  "ieeItemsForbidden",
  "ieeTargetUntargetable",
  "ieeDecisionPending",
  "ieeItemReactionOnly",
  "ieeTargetReacting",
  "ieePickRequired",
  "ieePickInvalid",
  // A cell an object may not stand on, an owner with as many as the season allows (wave D, §6.18).
  "ieeCellUnavailable",
  "ieeObjectLimit",
  // A game in flight replaced with nothing left to pick (wave C, §6.16): the pool's own reason.
  "catalogAllPlayed",
] as const;
export type UseRefusal = (typeof USE_REFUSALS)[number];

/** What a draw of the next game may be refused with (wave C, spec §5.5, §7.12). */
export const DRAW_REFUSALS = ["gameAlreadyHaveRoll", "ieeDecisionPending", "catalogAllPlayed"] as const;
export type DrawRefusal = (typeof DRAW_REFUSALS)[number];

/** `"self"` is the entry the scenario belongs to; anything else is another entry. */
export const ScenarioEntrySchema = z.union([z.literal("self"), EntryRefSchema]);
export type ScenarioEntry = z.infer<typeof ScenarioEntrySchema>;

const CarriedSchema = z.strictObject({
  entry: ScenarioEntrySchema,
  count: z.number().int().min(1).max(4).optional(),
});

/** A game of the scenario pool (wave C, spec §5.5). */
const ScenarioGameSchema = z.enum(SCENARIO_GAME_KEYS);

/** What a use picks for the next game in a scenario (wave C, spec §6.16): a genre, a span of years, a game of the pool. */
export const ScenarioPickSchema = z.union([
  z.strictObject({ genre: GenreSchema }),
  z.strictObject({
    years: z.tuple([YearSchema, YearSchema]).refine(([from, to]) => from <= to, { message: "years run from the first to the second" }),
  }),
  z.strictObject({ game: ScenarioGameSchema }),
  // The cell an item places itself on (wave D, spec §6.18).
  z.strictObject({ cell: z.number().int().min(0).max(39) }),
]);
export type ScenarioPick = z.infer<typeof ScenarioPickSchema>;

/** An object standing on the board before the first step (wave D, spec §6.18): the item, its cell and whose it is. */
const ScenarioObjectSchema = z.strictObject({
  entry: z.lazy(() => ScenarioEntrySchema),
  cell: z.number().int().min(0).max(39),
  /** Whose it is: the holder's unless set. */
  owner: z.enum(["holder", "rival"]).optional(),
});

const holderGiven = {
  position: z.number().int().min(0).max(39).optional(),
  balance: z.number().int().min(0).max(99).optional(),
  /** A game rolled and not reported yet. */
  inFlight: z.boolean().optional(),
  /** That game, of the scenario pool (wave C): in flight. */
  game: ScenarioGameSchema.optional(),
  /** The games passed this season so far, oldest first (wave C) — what `"lastPassed"` and `"passed"` read. */
  passed: z.array(ScenarioGameSchema).max(8).optional(),
  /** The dice sum of their last move — what «Магнит» compares against; none unless set. */
  lastRoll: z.number().int().min(1).max(60).optional(),
  carries: z.array(CarriedSchema).max(LIMITS.scenarioCarries).optional(),
};

export const ScenarioGivenSchema = z.strictObject({
  holder: z.strictObject(holderGiven).optional(),
  rival: z.strictObject({ ...holderGiven, left: z.boolean().optional() }).optional(),
  /** The season's dice: d6 unless set. */
  sides: z.number().int().min(2).max(20).optional(),
  /** The board loops: past the last cell is the first again. */
  loop: z.boolean().optional(),
  /** Server draws: `low` — chances hold and ranges give their low end; `high` — the opposite. */
  draws: z.enum(["low", "high"]).optional(),
  /** Objects standing on the board (wave D, spec §6.18), one per cell. */
  objects: z.array(ScenarioObjectSchema).max(4).optional(),
});
export type ScenarioGiven = z.infer<typeof ScenarioGivenSchema>;

const HoldingSchema = z.strictObject({
  entry: ScenarioEntrySchema,
  /** Active instances after the step; 0 = none. */
  count: z.number().int().min(0).max(8),
});
export type ScenarioHolding = z.infer<typeof HoldingSchema>;

/** What any step may check afterwards: who holds what, how the balances moved during it, where each stands. */
const stateExpect = {
  holder: z.array(HoldingSchema).max(LIMITS.scenarioHoldings).optional(),
  rival: z.array(HoldingSchema).max(LIMITS.scenarioHoldings).optional(),
  balance: z.number().int().min(-99).max(99).optional(),
  rivalBalance: z.number().int().min(-99).max(99).optional(),
  /** The cell each stands on after the step — an out-of-turn move shows here (spec §7.3). */
  position: z.number().int().min(0).max(39).optional(),
  rivalPosition: z.number().int().min(0).max(39).optional(),
  /** Whether a victim choice waits for the holder after the step (wave B, spec §7.6). */
  decision: z.enum(["pending", "none"]).optional(),
  /** The holder's game in flight after the step, of the scenario pool (wave C, spec §7.12). */
  game: z.enum([...SCENARIO_GAME_KEYS, "none"]).optional(),
  /** How many games the holder's pending choice offers after the step; 0 for none (wave C). */
  offered: z.number().int().min(0).max(5).optional(),
  /** How many completion conditions the holder's game in flight holds after the step; 0 for none (wave C, spec §6.17). */
  conditions: z.number().int().min(0).max(8).optional(),
  /** How many objects stand on the board after the step; 0 for none (wave D, spec §6.18). */
  objects: z.number().int().min(0).max(8).optional(),
};

const RollStepSchema = z.strictObject({
  do: z.literal("roll"),
  by: z.enum(["holder", "rival"]).optional(),
  outcome: z.enum(["passed", "dropped"]),
  /** What the dice show in total. */
  dice: z.number().int().min(0).max(60),
  /**
   * The faces the server draws after the first throw, in order — the dice
   * thrown again and a second throw (spec §7.2). The last one repeats.
   */
  then: z.array(z.number().int().min(1).max(20)).min(1).max(8).optional(),
  /** The cell the move ends on, wherever that is; a plain cell unless set. */
  cell: z.enum(CELL_TYPES).optional(),
  /** In the reaction window: use the roller's newest of this reaction item if it is offered; accept otherwise (wave B, §7.4). */
  react: ScenarioEntrySchema.optional(),
  expect: z
    .strictObject({
      /** Cells travelled, signed: back is negative; before the landing cell acts. */
      moved: z.number().int().min(-60).max(60).optional(),
      diceCount: z.number().int().min(0).max(10).optional(),
      diceSides: z.number().int().min(2).max(30).optional(),
      cellFires: z.boolean().optional(),
      wheel: z.enum(["none", "bonus", "penalty"]).optional(),
      /** The wheel a rule spins once more after the landing's own (spec §6.12); none unless one asks. */
      wheelAgain: z.enum(["none", "bonus", "penalty"]).optional(),
      /** Whether a reaction window opened, and how it was answered (wave B, §7.4). */
      window: z.enum(["none", "accepted", "used"]).optional(),
      ...stateExpect,
    })
    .optional(),
});

const UseStepSchema = z.strictObject({
  do: z.literal("use"),
  /** The item used — the entry itself unless named. */
  item: EntryRefSchema.optional(),
  /** Who uses it: the holder unless set — the rival, to aim at the holder (wave B, spec §6.13). */
  by: z.enum(["holder", "rival"]).optional(),
  /** Default: the other player when the item is aimed at another player, nobody otherwise. */
  on: z.enum(["rival", "holder", "nobody"]).optional(),
  /** What the use picks, for an item that asks: the holder's newest instance of this entry (spec §6.10). */
  choose: ScenarioEntrySchema.optional(),
  /** What the use picks from the season's catalog, for an item that asks: this entry (spec §6.12). */
  chooseEntry: ScenarioEntrySchema.optional(),
  /** What the use picks for the next game, for an item that asks (wave C, spec §6.16). */
  pick: ScenarioPickSchema.optional(),
  /** A choice of games the use opens (wave C, spec §7.12): take this one. */
  take: ScenarioGameSchema.optional(),
  expect: z
    .strictObject({
      result: z.enum(["used", "refused"]).optional(),
      reason: z.enum(USE_REFUSALS).optional(),
      ...stateExpect,
    })
    .optional(),
});

const GrantStepSchema = z.strictObject({
  do: z.literal("grant"),
  entry: ScenarioEntrySchema,
  to: z.enum(["holder", "rival"]).optional(),
  /** As the wheel drops it: the recipient's entries may answer it (wave B, spec §6.13); as staff hand out otherwise. */
  via: z.literal("wheel").optional(),
  expect: z
    .strictObject({
      result: z.enum(["granted", "refreshed", "refused"]).optional(),
      ...stateExpect,
    })
    .optional(),
});

/** The ways a victim choice is answered (wave B, spec §7.6). */
export const DECIDE_OPTIONS = ["discard", "endure", "retain"] as const;

const DecideStepSchema = z.strictObject({
  do: z.literal("decide"),
  /** Who answers their pending victim choice: the holder unless set (wave B, spec §7.6). */
  by: z.enum(["holder", "rival"]).optional(),
  /** The option taken; the default when none is named. */
  option: z.enum(DECIDE_OPTIONS).optional(),
  /** The items picked: the newest held instance of each entry, in order — the next newest for an entry named again. */
  picks: z.array(ScenarioEntrySchema).min(1).max(3).optional(),
  expect: z
    .strictObject({
      result: z.enum(["decided", "refused"]).optional(),
      ...stateExpect,
    })
    .optional(),
});

const DrawStepSchema = z.strictObject({
  do: z.literal("draw"),
  /** Whose next game is picked, as rolling picks it: the holder unless set (wave C, spec §7.12). */
  by: z.enum(["holder", "rival"]).optional(),
  /** A choice of games the draw opens: take this one; it waits otherwise. */
  take: ScenarioGameSchema.optional(),
  expect: z
    .strictObject({
      result: z.enum(["drawn", "choosing", "refused"]).optional(),
      reason: z.enum(DRAW_REFUSALS).optional(),
      ...stateExpect,
    })
    .optional(),
});

export const ScenarioStepSchema = z.discriminatedUnion("do", [RollStepSchema, UseStepSchema, GrantStepSchema, DecideStepSchema, DrawStepSchema]);
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;
export type RollStep = z.infer<typeof RollStepSchema>;
export type UseStep = z.infer<typeof UseStepSchema>;
export type GrantStep = z.infer<typeof GrantStepSchema>;
export type DecideStep = z.infer<typeof DecideStepSchema>;
export type DrawStep = z.infer<typeof DrawStepSchema>;

export const ScenarioSchema = z.strictObject({
  /** A stable code, unique within the entry — `SC-SWAMP-1`. */
  id: z.string().regex(SCENARIO_ID_RE, "capital letters, digits and - (2–32)").optional(),
  /** The promise, phrased as a consequence. */
  title: LocalizedSchema(LIMITS.scenarioTitleLength),
  /** Why the expected result is what it is, when that is not obvious. */
  note: LocalizedSchema(LIMITS.flavorLength).optional(),
  given: ScenarioGivenSchema.optional(),
  steps: z.array(ScenarioStepSchema).min(1).max(LIMITS.scenarioSteps),
});
export type ScenarioDoc = z.infer<typeof ScenarioSchema>;

export const EntryDocSchema = z.strictObject({
  dslVersion: z.literal(DSL_VERSION),
  kind: z.enum(ENTRY_KINDS),
  slug: z.string().regex(SLUG_RE, "lowercase letters, digits and _ (2–48)"),
  name: LocalizedSchema(LIMITS.nameLength),
  flavor: LocalizedSchema(LIMITS.flavorLength).optional(),
  character: z.enum(CHARACTERS),
  rarity: z.enum(RARITIES),
  tags: z.array(z.string().regex(TAG_RE)).max(LIMITS.tags),
  /**
   * Heroicon export name used when the entry has no artwork (spec §12). One of
   * `IEE_GLYPHS`; checked there rather than here so the list can grow without
   * a schema change.
   */
  glyph: z.string().regex(/^[A-Z][A-Za-z0-9]*Icon$/).optional(),
  params: z
    .record(z.string().regex(PARAM_NAME_RE), ParamDeclSchema)
    .refine((r) => Object.keys(r).length <= LIMITS.params, { message: "too many params" })
    .optional(),
  usage: UsageSchema.optional(),
  duration: DurationSchema.optional(),
  stacking: StackingSchema.optional(),
  protection: z.strictObject({ tier: z.union([z.literal(1), z.literal(2)]) }).optional(),
  rules: z.array(RuleSchema).max(LIMITS.rules),
  /** Entry scenarios (§5.5): what the entry promises, run on publish — a red one blocks it. */
  scenarios: z.array(ScenarioSchema).max(LIMITS.scenarios).optional(),
});
export type EntryDoc = z.infer<typeof EntryDocSchema>;

/** Name in a locale, falling back to `ru`. */
export function localize(text: Localized, locale: Locale): string {
  return text[locale] ?? text.ru;
}

/** All three locales, filled from `ru` where missing. */
export function fillLocales(text: Localized): LocalizedText {
  return { ru: text.ru, en: text.en ?? text.ru, uk: text.uk ?? text.ru };
}
