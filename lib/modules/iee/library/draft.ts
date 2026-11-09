/**
 * The entry editor's model (docs/IEE_CONSTRUCTOR_SPEC.md §5, plan §6 task
 * 3.2): pure functions the constructor's forms call to build an entry
 * document, and the analysis its right-hand panel shows.
 *
 * No database code — client components import this file directly, and the
 * server's `saveDraft` / publish run the same checks on what it produces. The
 * vocabulary decides what may go where (`placement.ts` in the DSL); this file
 * only knows how to edit a document without breaking its shape.
 */
import {
  CHARACTERS,
  DSL_VERSION,
  DurationSchema,
  ENTRY_KINDS,
  ParamDeclSchema,
  RARITIES,
  RuleSchema,
  SLUG_RE,
  StackingSchema,
  TAG_RE,
  UsageSchema,
  actionDef,
  checkEntry,
  entryPower,
  fillLocales,
  hasTargetAt,
  isInstantEffect,
  paramDefaults,
  ruleSentence,
  ruleText,
  triggersFor,
  type TriggerShape,
  type ActionDoc,
  type ActionOp,
  type Character,
  type ConditionOp,
  type EntryDoc,
  type EntryFacts,
  type EntryKind,
  type Issue,
  type Locale,
  type LocalizedText,
  type OpDoc,
  type ParamDecl,
  type RuleDoc,
  type RuleScope,
  type SourceValueDoc,
  type ValueSourceName,
} from "@/lib/engine/iee/dsl";
import { HANDOUT_TAG } from "@/lib/engine";

import { cleanScenario, scenarioOf } from "./scenario-draft";

type Localized = EntryDoc["name"];

/** Base tag taxonomy (spec §6.6); packs may add their own. */
export const BASE_TAGS = [
  "directed",
  "movement",
  "dice",
  "inventory",
  "game_pool",
  "game_condition",
  "board",
  "protection",
  "curse",
  HANDOUT_TAG,
] as const;

// ---------------------------------------------------------------------------
// New entries and stored drafts
// ---------------------------------------------------------------------------

const DEFAULT_USAGE = {
  activation: "active" as const,
  window: "anytime" as const,
  target: { who: "self" as const },
  charges: 1,
};

/** The draft a new entry starts with: valid in shape, refused at publish until it has a rule. */
export function skeletonDraft(slug: string, kind: EntryKind): EntryDoc {
  return {
    dslVersion: DSL_VERSION,
    kind,
    slug,
    name: { ru: slug },
    character: "bonus",
    rarity: "common",
    tags: [],
    ...(kind === "item"
      ? { usage: { ...DEFAULT_USAGE, target: { ...DEFAULT_USAGE.target } } }
      : { duration: { unit: "rolls" as const, count: 1 }, stacking: { mode: "refresh" as const } }),
    rules: [],
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

function localizedOf(value: unknown): Localized | undefined {
  if (!isRecord(value)) return undefined;
  const out: Localized = { ru: typeof value.ru === "string" ? value.ru : "" };
  if (typeof value.en === "string") out.en = value.en;
  if (typeof value.uk === "string") out.uk = value.uk;
  return out;
}

function opsOf(value: unknown): OpDoc[] {
  if (!Array.isArray(value)) return [];
  return value.filter((op): op is OpDoc => isRecord(op) && typeof op.op === "string");
}

/**
 * A stored draft as the editor holds it. Drafts may be invalid while edited
 * (§10.1) — a half-built rule, a missing name — so this keeps whatever has
 * the right shape and fills what is missing, rather than refusing the draft;
 * the checks then say what is still wrong.
 */
export function editableDraft(raw: unknown, entry: { slug: string; kind: EntryKind }): EntryDoc {
  const r = isRecord(raw) ? raw : {};
  const kind = oneOf(r.kind, ENTRY_KINDS) ?? entry.kind;
  const doc: EntryDoc = {
    dslVersion: DSL_VERSION,
    kind,
    slug: typeof r.slug === "string" ? r.slug : entry.slug,
    name: localizedOf(r.name) ?? { ru: entry.slug },
    character: oneOf(r.character, CHARACTERS) ?? "bonus",
    rarity: oneOf(r.rarity, RARITIES) ?? "common",
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    rules: Array.isArray(r.rules)
      ? r.rules.filter(isRecord).map((rule): RuleDoc => {
          const out: RuleDoc = { when: typeof rule.when === "string" ? rule.when : "", do: opsOf(rule.do) };
          if (Array.isArray(rule.if)) out.if = opsOf(rule.if);
          const priority = oneOf(rule.priority, ["early", "normal", "late"] as const);
          if (priority) out.priority = priority;
          return out;
        })
      : [],
  };
  const flavor = localizedOf(r.flavor);
  if (flavor) doc.flavor = flavor;
  if (typeof r.glyph === "string") doc.glyph = r.glyph;
  if (isRecord(r.params)) doc.params = r.params as Record<string, ParamDecl>;
  if (isRecord(r.usage)) doc.usage = r.usage as EntryDoc["usage"];
  if (isRecord(r.duration)) doc.duration = r.duration as EntryDoc["duration"];
  if (isRecord(r.stacking)) doc.stacking = r.stacking as EntryDoc["stacking"];
  if (isRecord(r.protection)) doc.protection = r.protection as EntryDoc["protection"];
  if (Array.isArray(r.scenarios)) {
    doc.scenarios = r.scenarios.map(scenarioOf).filter((x): x is NonNullable<ReturnType<typeof scenarioOf>> => x !== null);
  }
  return doc;
}

function cleanLocalized(text: Localized | undefined, keepEmptyRu: boolean): Localized | undefined {
  if (!text) return undefined;
  const ru = text.ru.trim();
  const en = text.en?.trim();
  const uk = text.uk?.trim();
  if (!keepEmptyRu && !ru && !en && !uk) return undefined;
  const out: Localized = { ru };
  if (en) out.en = en;
  if (uk) out.uk = uk;
  return out;
}

/**
 * The draft as it is saved: trimmed texts, empty translations and an empty
 * flavor dropped, duplicate tags removed, the default priority left out — so
 * an entry built in the editor hashes like the same entry written by hand.
 */
export function cleanDraft(doc: EntryDoc): EntryDoc {
  const out: EntryDoc = {
    ...doc,
    slug: doc.slug.trim(),
    name: cleanLocalized(doc.name, true)!,
    tags: [...new Set(doc.tags.map((t) => t.trim()).filter(Boolean))],
    rules: doc.rules.map((rule) => {
      const r: RuleDoc = { when: rule.when, do: rule.do };
      if (rule.if && rule.if.length > 0) r.if = rule.if;
      if (rule.priority && rule.priority !== "normal") r.priority = rule.priority;
      return r;
    }),
  };
  const flavor = cleanLocalized(doc.flavor, false);
  if (flavor) out.flavor = flavor;
  else delete out.flavor;
  if (!doc.glyph) delete out.glyph;
  if (!doc.params || Object.keys(doc.params).length === 0) delete out.params;
  if (out.kind === "item") {
    delete out.duration;
    delete out.stacking;
  } else delete out.usage;
  if (doc.scenarios && doc.scenarios.length > 0) out.scenarios = doc.scenarios.map(cleanScenario);
  else delete out.scenarios;
  return out;
}

/** Switches an unpublished entry between item and effect; rules stay and the checks flag what no longer fits. */
export function withKind(doc: EntryDoc, kind: EntryKind): EntryDoc {
  if (doc.kind === kind) return doc;
  const { usage, duration, stacking, ...rest } = doc;
  if (kind === "item") {
    return { ...rest, kind, usage: usage ?? { ...DEFAULT_USAGE, target: { ...DEFAULT_USAGE.target } } };
  }
  return {
    ...rest,
    kind,
    duration: duration ?? { unit: "rolls", count: 1 },
    stacking: stacking ?? { mode: "refresh" },
  };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Where a new rule starts: the use of an active item, the move of an effect or
 * of an item that works while held, the arrival of an instant effect.
 */
export function newRule(kind: EntryKind, shape: TriggerShape = {}): RuleDoc {
  const triggers = triggersFor(kind, shape);
  const when = triggers.includes("afterMovement") ? "afterMovement" : (triggers[0] ?? "onUse");
  return { when, do: [] };
}

export interface OpContext {
  scope: RuleScope;
  /** The rule's trigger. */
  when: string;
  /** The entry's character — a penalty's numbers start negative. */
  character: Character;
}

/** A new condition, ready to edit. */
export function defaultCondition(op: ConditionOp): OpDoc {
  switch (op) {
    case "outcome":
      return { op, is: "passed" };
    case "cellType":
      return { op, in: ["penalty"] };
    case "chance":
      return { op, percent: 50 };
    case "hasEntry":
      return { op, who: "self", character: "penalty" };
    case "diceShow":
      return { op, of: "sum", cmp: "lte", value: 4 };
    // Wave A: the last place catching up, a full hand, the chosen player ahead, «Магнит».
    case "rank":
      return { op, is: "last" };
    case "itemCount":
      return { op, cmp: "gte", value: 2 };
    case "targetRelative":
      return { op, is: "ahead" };
    case "compareLastRoll":
      return { op, mine: "next", cmp: "lt", theirs: "target" };
    // Wave B: what arrives — a rival's harmful action, the case protection is for.
    case "incoming":
      return { op, is: "harm" };
  }
}

/** A number read from the moment, ready to edit (spec §6.5): a count of items leans the entry's way. */
export function defaultSource(source: ValueSourceName, character: Character): SourceValueDoc {
  switch (source) {
    case "diceSum":
      return { source: "diceSum" };
    case "targetLastRoll":
      return { source: "targetLastRoll" };
    case "itemCount":
      return { source: "itemCount", multiplier: character === "penalty" ? -1 : 1 };
  }
}

/**
 * A new action, ready to edit. Numbers lean the way the entry does; an action
 * that hands something out aims at the chosen player where there is one, and
 * waits for the entry to be picked.
 */
export function defaultAction(op: ActionOp, ctx: OpContext): OpDoc {
  const sign = ctx.character === "penalty" ? -1 : 1;
  const aimed = hasTargetAt(ctx.scope, ctx.when);
  switch (op) {
    case "steps":
      return { op, delta: sign };
    case "dice":
      return sign > 0 ? { op, count: 1 } : { op, sides: -2 };
    case "balance":
      return aimed ? { op, amount: -2, to: "target" } : { op, amount: 2 * sign };
    case "skipCellEffect":
    case "noMove":
    case "reroll":
      return { op };
    case "grantEffect":
    case "grantItem":
      return { op, to: aimed ? "target" : "self" };
    case "cleanse":
      return { op, character: "penalty", count: 1 };
    case "rerollOn":
      return { op, values: sign > 0 ? [1] : [6] };
    case "bestOfTwo":
    case "worstOfTwo":
    case "direction":
      return op === "direction" ? { op, lowerHalf: "back" } : { op };
    case "resultModify":
      return { op, delta: sign };
    // Out of turn: an item aimed at a player moves them back; anything else moves its own holder.
    case "move":
      return aimed ? { op, by: -2, who: "target" } : { op, by: 3 * sign };
    case "moveToTarget":
      return { op, at: "cell" };
    case "swapPositions":
      return { op, with: aimed ? "target" : "nearestBehind" };
    case "rollbackLastMove":
      return { op, who: aimed ? "target" : "self" };
    case "halveGap":
      return { op, who: "nearestBehind" };
    // Where the user is there to pick, they pick; elsewhere the newest goes.
    case "remove":
      return { op, what: "any", character: "penalty", pick: ctx.when === "onUse" ? "choice" : "newest" };
    // Item operations (wave B): one item; a gift goes to the chosen player where there is one.
    case "stealItem":
    case "swapItems":
    case "copyItem":
      return { op };
    case "transferItem":
      return { op, to: aimed ? "target" : "randomRival" };
    case "grantChosen":
      return { op, rarity: ["common"] };
    case "extraSpin":
      return { op, pool: ctx.character === "penalty" ? "penalty" : "bonus" };
    // What arrives, and protection (wave B): a doubling, a cell forward instead, ordinary pierce.
    case "block":
    case "reflect":
    case "untargetable":
    case "forbidItems":
      return { op };
    case "amplify":
      return { op, factor: 2 };
    case "replace":
      return { op, with: 1 };
    case "pierce":
      return { op, value: 1 };
    // The player's choices (wave B): one item of their choice; a limit of one item.
    case "victimChoice":
      return { op };
    case "holdLimit":
      return { op, max: 1 };
    // The next game (wave C): an effect works with what its item's use picked; a held item, with what it says itself.
    case "poolExclude":
      if (ctx.character === "penalty") return { op, genres: "lastPassed" };
      return ctx.scope.kind === "effect" ? { op, genres: "picked" } : { op, rating: { max: 2 } };
    case "poolRequire":
      if (ctx.character === "penalty") return { op, years: { max: 2009 } };
      return ctx.scope.kind === "effect" ? { op, genres: "picked" } : { op, rating: { min: 3 } };
    case "poolFavor":
      return { op, factor: 3 };
    // A choice of three; a game in flight replaced, or set aside for two picks.
    case "chooseOfN":
      return { op, n: 3 };
    case "rerollGame":
      return { op };
    case "postponeGame":
      return { op, afterRolls: 2 };
    // A completion condition to write in the entry's own words; immunity has nothing to set (spec §6.17).
    case "addCondition":
      return { op, text: { ru: "Пройти на высокой сложности", en: "Beat it on a hard difficulty" } };
    case "conditionImmunity":
      return { op };
    // Board objects (wave D): placed on the cell the use picks; a mine's stop and throw back, a spring's two cells more.
    case "placeObject":
    case "stopMove":
      return { op };
    case "push":
      return { op, delta: -2 };
    case "extend":
      return { op, delta: 2 };
    case "spinInstead":
      return { op, pool: "penalty" };
    // The same cell (wave D): the rival who arrived takes the item.
    case "takeEntry":
      return { op };
  }
}

/** Moves an element of a list by `delta` places, clamped to the list. */
export function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = Math.max(0, Math.min(list.length - 1, index + delta));
  if (to === index) return [...list];
  const out = [...list];
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item!);
  return out;
}

/** Replaces one rule. */
export function updateRule(doc: EntryDoc, index: number, change: (rule: RuleDoc) => RuleDoc): EntryDoc {
  return { ...doc, rules: doc.rules.map((rule, i) => (i === index ? change(rule) : rule)) };
}

/** Replaces one condition (`if`) or action (`do`) of a rule. */
export function updateOp(
  doc: EntryDoc,
  rule: number,
  part: "if" | "do",
  item: number,
  change: (op: OpDoc) => OpDoc,
): EntryDoc {
  return updateRule(doc, rule, (r) => {
    const list = r[part] ?? [];
    return { ...r, [part]: list.map((op, i) => (i === item ? change(op) : op)) };
  });
}

/** An operation with one field set — or removed, for `undefined`. */
export function withField(op: OpDoc, key: string, value: unknown): OpDoc {
  const next: OpDoc = { ...op };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

// ---------------------------------------------------------------------------
// Parameters (spec §5.1) — the season-tunable numbers and their bounds
// ---------------------------------------------------------------------------

/** The fields of each primitive that hold a number (a value, §6.5). */
export const VALUE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  steps: ["delta"],
  dice: ["count", "sides"],
  balance: ["amount"],
  chance: ["percent"],
  diceShow: ["value"],
  resultModify: ["delta", "cap"],
  move: ["by"],
  push: ["delta"],
  extend: ["delta"],
};

/** What a parameter made from a field is called by default. */
const PARAM_BASE: Readonly<Record<string, string>> = {
  "steps.delta": "steps",
  "dice.count": "dice",
  "dice.sides": "sides",
  "balance.amount": "points",
  "chance.percent": "chance",
  "diceShow.value": "face",
  "resultModify.delta": "result",
  "resultModify.cap": "cap",
  "move.by": "cells",
  "push.delta": "push",
  "extend.delta": "further",
};

const paramOf = (value: unknown): string | null =>
  isRecord(value) && typeof value.param === "string" ? value.param : null;

function mapOps(doc: EntryDoc, fn: (op: OpDoc) => OpDoc): EntryDoc {
  return {
    ...doc,
    rules: doc.rules.map((rule) => ({
      ...rule,
      ...(rule.if ? { if: rule.if.map(fn) } : {}),
      do: rule.do.map(fn),
    })),
  };
}

function mapValues(doc: EntryDoc, fn: (value: unknown) => unknown): EntryDoc {
  return mapOps(doc, (op) => {
    const fields = VALUE_FIELDS[op.op];
    if (!fields) return op;
    let changed = false;
    const next: OpDoc = { ...op };
    for (const field of fields) {
      if (!(field in op)) continue;
      const mapped = fn(op[field]);
      if (mapped !== op[field]) {
        next[field] = mapped;
        changed = true;
      }
    }
    return changed ? next : op;
  });
}

/** How many values name each parameter. */
export function paramUses(doc: EntryDoc): Record<string, number> {
  const uses: Record<string, number> = {};
  mapValues(doc, (value) => {
    const name = paramOf(value);
    if (name) uses[name] = (uses[name] ?? 0) + 1;
    return value;
  });
  return uses;
}

/** A parameter name not taken yet: `steps`, `steps2`, … */
export function freeParamName(doc: EntryDoc, base: string): string {
  const taken = new Set(Object.keys(doc.params ?? {}));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/**
 * Bounds a new parameter starts with: a number keeps its sign, so a season can
 * weaken a penalty but never turn it into a bonus (§5.1); a chance stays a chance.
 */
export function boundsFor(field: string, value: number): { min: number; max: number } {
  if (field === "chance.percent") return { min: 1, max: 99 };
  if (value < 0) return { min: Math.min(value, -6), max: -1 };
  if (value > 0) return { min: 1, max: Math.max(value, 6) };
  return { min: -6, max: 6 };
}

/**
 * Turns a literal into a new parameter with that default — "let the season
 * tune this". Returns the document with the declaration and the name to put
 * where the literal was.
 */
export function declareParam(doc: EntryDoc, field: string, value: number): { doc: EntryDoc; name: string } {
  const name = freeParamName(doc, PARAM_BASE[field] ?? "value");
  const decl: ParamDecl = { type: "int", default: value, ...boundsFor(field, value) };
  return { doc: { ...doc, params: { ...(doc.params ?? {}), [name]: decl } }, name };
}

/** Renames a parameter and every value that names it. Refuses a taken or malformed name. */
export function renameParam(doc: EntryDoc, from: string, to: string): EntryDoc {
  const params = doc.params ?? {};
  if (from === to || !params[from] || params[to] || !/^[a-z][a-zA-Z0-9_]{0,31}$/.test(to)) return doc;
  const renamed: Record<string, ParamDecl> = {};
  for (const [name, decl] of Object.entries(params)) renamed[name === from ? to : name] = decl;
  return mapValues({ ...doc, params: renamed }, (value) => (paramOf(value) === from ? { param: to } : value));
}

/** Removes a parameter; the values that named it keep its default as a plain number. */
export function removeParam(doc: EntryDoc, name: string): EntryDoc {
  const params = { ...(doc.params ?? {}) };
  const decl = params[name];
  delete params[name];
  const literal = decl && decl.type === "int" ? decl.default : 0;
  const next = mapValues(doc, (value) => (paramOf(value) === name ? literal : value));
  if (Object.keys(params).length === 0) {
    const { params: _dropped, ...rest } = next;
    return rest;
  }
  return { ...next, params };
}

// ---------------------------------------------------------------------------
// Where a check points (spec §14) — so the editor can mark the field
// ---------------------------------------------------------------------------

export type EditorBlock = "basics" | "usage" | "rules" | "duration" | "limits" | "interaction" | "scenarios" | "general";

export interface IssueSpot {
  block: EditorBlock;
  /** For rules: which rule, which part, which condition or action. */
  rule?: number;
  part?: "when" | "if" | "do" | "priority";
  item?: number;
  /** For scenarios: which scenario and which step. */
  scenario?: number;
  step?: number;
  /** The field inside the block or the operation, dotted. */
  field?: string;
}

export function issueSpot(path: readonly (string | number)[]): IssueSpot {
  const [head, ...rest] = path;
  const dotted = (parts: readonly (string | number)[]) => (parts.length > 0 ? parts.join(".") : undefined);
  switch (head) {
    case "slug":
    case "kind":
    case "name":
    case "flavor":
    case "character":
    case "rarity":
    case "glyph":
      return { block: "basics", field: dotted(path) };
    case "usage":
      return { block: "usage", field: dotted(rest) };
    case "duration":
    case "stacking":
      return { block: "duration", field: dotted(path) };
    case "params":
      return { block: "limits", field: dotted(rest) };
    case "tags":
    case "protection":
      return { block: "interaction", field: head };
    case "rules": {
      const rule = rest[0];
      if (typeof rule !== "number") return { block: "rules" };
      const part = rest[1];
      if (part === "if" || part === "do") {
        const item = rest[2];
        return typeof item === "number"
          ? { block: "rules", rule, part, item, field: dotted(rest.slice(3)) }
          : { block: "rules", rule, part };
      }
      if (part === "when" || part === "priority") return { block: "rules", rule, part };
      return { block: "rules", rule };
    }
    case "scenarios": {
      const scenario = rest[0];
      if (typeof scenario !== "number") return { block: "scenarios" };
      const step = rest[1] === "steps" && typeof rest[2] === "number" ? rest[2] : undefined;
      return step === undefined
        ? { block: "scenarios", scenario, field: dotted(rest.slice(1)) }
        : { block: "scenarios", scenario, step, field: dotted(rest.slice(3)) };
    }
    default:
      return { block: "general" };
  }
}

/** Issues that point into one condition or action of one rule. */
export function issuesAt(issues: readonly Issue[], rule: number, part: "if" | "do", item: number): Issue[] {
  return issues.filter((i) => {
    const spot = issueSpot(i.path);
    return spot.rule === rule && spot.part === part && spot.item === item;
  });
}

// ---------------------------------------------------------------------------
// The right-hand panel: checks, rule text, power, the card
// ---------------------------------------------------------------------------

export interface DraftContext {
  entryId: string;
  /** What publishing resolves a reference to: the latest revision of the entry. */
  published: (entryId: string) => EntryFacts | null;
  /** Names for the rule text — also entries not published yet, so a packmate reads by name. */
  named: (entryId: string) => EntryFacts | null;
  /** Another entry's power, when known: what handing it out is worth (§14). */
  powerOf?: (entryId: string) => number | null;
}

export interface DraftPreview {
  kind: EntryKind;
  name: LocalizedText;
  flavor: LocalizedText | null;
  /** Generated from the rules that check clean; the rest are left out until they do. */
  ruleText: LocalizedText;
  character: Character;
  polarity: "positive" | "negative";
  rarity: EntryDoc["rarity"];
  tags: readonly string[];
  glyph: string | null;
  usage: {
    activation: "active" | "passive" | "cursed";
    window: "anytime" | "before_roll" | "after_dice" | "on_open_roll";
    target: "self" | "other" | "any" | "none";
    /** Uses, or firings of a passive or cursed item; null for a passive one that stays while held. */
    charges: number | null;
  } | null;
  duration: { unit: string; count: number | null } | null;
}

export interface DraftAnalysis {
  /** The publish checks of this one entry (§14) — the server runs the same on save and on publish. */
  errors: Issue[];
  warnings: Issue[];
  /** Indices of rules the preview leaves out because they do not check clean. */
  brokenRules: number[];
  /** Each rule as its sentence, by rule index; null for a rule left out. */
  ruleSentences: (LocalizedText | null)[];
  /** An action harms the chosen player — what protection will react to (§6.3, D9). */
  harmsTarget: boolean;
  /** Strength estimate of what checks clean (§14); null when nothing does. */
  power: number | null;
  preview: DraftPreview;
}

const EMPTY_TEXT: LocalizedText = { ru: "", en: "", uk: "" };

/**
 * A document the generator can always read: the frame repaired with safe
 * values, invalid parameters, usage and duration dropped. Only for the preview
 * — the checks run on the document as it is.
 */
function readableFrame(doc: EntryDoc, rules: RuleDoc[]): EntryDoc {
  const params: Record<string, ParamDecl> = {};
  for (const [name, decl] of Object.entries(doc.params ?? {})) {
    const parsed = ParamDeclSchema.safeParse(decl);
    if (parsed.success && /^[a-z][a-zA-Z0-9_]{0,31}$/.test(name)) params[name] = parsed.data;
  }
  const name = cleanLocalized(doc.name, true)!;
  const out: EntryDoc = {
    dslVersion: DSL_VERSION,
    kind: doc.kind,
    slug: SLUG_RE.test(doc.slug) ? doc.slug : "draft",
    name: { ...name, ru: name.ru || doc.slug || "—" },
    character: doc.character,
    rarity: doc.rarity,
    tags: doc.tags.filter((t) => TAG_RE.test(t)).slice(0, 12),
    rules,
  };
  if (Object.keys(params).length > 0) out.params = params;
  if (doc.kind === "item") {
    const usage = UsageSchema.safeParse(doc.usage);
    if (usage.success) out.usage = usage.data;
  } else {
    const duration = DurationSchema.safeParse(doc.duration);
    if (duration.success) out.duration = duration.data;
    const stacking = StackingSchema.safeParse(doc.stacking);
    if (stacking.success) out.stacking = stacking.data;
  }
  return out;
}

export function analyzeDraft(doc: EntryDoc, ctx: DraftContext): DraftAnalysis {
  const clean = cleanDraft(doc);
  const check = checkEntry(clean, { entryId: ctx.entryId, resolve: ctx.published, powerOf: ctx.powerOf });

  // The preview reads what it can: a rule with an error is left out, except
  // for a reference to an entry not published yet — it reads by name.
  const parseable = clean.rules
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule }) => RuleSchema.safeParse(rule).success);
  const frame = readableFrame(
    clean,
    parseable.map((p) => p.rule),
  );
  const probe = checkEntry(frame, { entryId: ctx.entryId, resolve: ctx.named, powerOf: ctx.powerOf });
  const broken = new Set<number>(clean.rules.map((_, i) => i).filter((i) => !parseable.some((p) => p.i === i)));
  const ruleOf = (issue: Issue): number | null =>
    issue.path[0] === "rules" && typeof issue.path[1] === "number" ? issue.path[1] : null;
  for (const issue of check.errors) {
    const rule = ruleOf(issue);
    if (rule === null) continue;
    const ref = issue.code === "missing_ref" ? issueEntryId(clean, issue.path) : null;
    if (ref !== null && ctx.named(ref) !== null) continue;
    broken.add(rule);
  }
  for (const issue of probe.errors) {
    const rule = ruleOf(issue);
    if (rule !== null) broken.add(parseable[rule]!.i);
  }
  const readable: EntryDoc = { ...frame, rules: clean.rules.filter((_, i) => !broken.has(i)) };

  // A document that does not parse reports its shape and nothing else; the
  // editor wants every problem at once, so the repaired frame's own findings
  // join in, pointed back at the rules they came from.
  let errors = check.errors;
  let warnings = check.warnings;
  if (!check.doc) {
    const rest = checkEntry(frame, { entryId: ctx.entryId, resolve: ctx.published, powerOf: ctx.powerOf });
    const back = (issue: Issue): Issue => {
      const rule = ruleOf(issue);
      if (rule === null) return issue;
      return { ...issue, path: ["rules", parseable[rule]!.i, ...issue.path.slice(2)] };
    };
    const seen = new Set(errors.map((e) => `${e.code}:${e.path.join(".")}`));
    errors = [...errors, ...rest.errors.map(back).filter((e) => !seen.has(`${e.code}:${e.path.join(".")}`))];
    warnings = rest.warnings.map(back);
  }
  let text = EMPTY_TEXT;
  let power: number | null = null;
  const sentences: (LocalizedText | null)[] = clean.rules.map(() => null);
  let harmsTarget = false;
  if (probe.doc) {
    const params = paramDefaults(readable.params);
    const decls = readable.params ?? {};
    const resolve = (ref: { entry: string }) => ctx.named(ref.entry);
    try {
      text = ruleText(readable, { params, resolve: ctx.named });
      power = entryPower(readable, { resolve, powerOf: ctx.powerOf });
      clean.rules.forEach((rule, i) => {
        if (broken.has(i)) return;
        const line = {} as LocalizedText;
        for (const locale of ["ru", "en", "uk"] as Locale[]) {
          line[locale] = ruleSentence(rule, { locale, params, decls, resolve }, isInstantEffect(readable));
        }
        sentences[i] = line;
        for (const action of rule.do as ActionDoc[]) {
          if (actionDef(action).harm(action, { params, decls, resolve }) === "target") harmsTarget = true;
        }
      });
    } catch {
      // A shape the checks did not foresee: show no text rather than break the editor.
      text = EMPTY_TEXT;
    }
  }

  const usage = frame.usage;
  const duration = frame.duration;
  return {
    errors,
    warnings,
    brokenRules: [...broken].sort((a, b) => a - b),
    ruleSentences: sentences,
    harmsTarget,
    power: readable.rules.length > 0 ? power : null,
    preview: {
      kind: clean.kind,
      name: fillLocales(frame.name),
      flavor: clean.flavor && clean.flavor.ru ? fillLocales(clean.flavor) : null,
      ruleText: text,
      character: clean.character,
      polarity: clean.character === "bonus" ? "positive" : "negative",
      rarity: clean.rarity,
      tags: frame.tags,
      glyph: clean.glyph ?? null,
      usage:
        clean.kind === "item" && usage
          ? {
              activation: usage.activation,
              window: usage.window ?? "anytime",
              target: usage.target?.who ?? "self",
              charges: usage.charges ?? (usage.activation === "passive" ? null : 1),
            }
          : null,
      duration:
        clean.kind === "effect" && duration
          ? {
              unit: duration.unit,
              // The next game is one game; permanent and instant keep no count.
              count: duration.unit === "next_game" ? 1 : duration.unit === "permanent" ? null : (duration.count ?? null),
            }
          : null,
    },
  };
}

/** The entry id an issue's path points at (`…/entry`), when it does. */
function issueEntryId(doc: EntryDoc, path: readonly (string | number)[]): string | null {
  const [, rule, part, item] = path;
  if (typeof rule !== "number" || (part !== "if" && part !== "do") || typeof item !== "number") return null;
  const op = doc.rules[rule]?.[part]?.[item];
  const entry = isRecord(op) && isRecord(op.entry) ? op.entry.entry : null;
  return typeof entry === "string" ? entry : null;
}

/** Every locale's name filled — `ru` stands in for a missing translation, as the game shows it. */
export function namesOf(doc: EntryDoc): LocalizedText {
  return fillLocales({ ...doc.name, ru: doc.name.ru || doc.slug });
}
