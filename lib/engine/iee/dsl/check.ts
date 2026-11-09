/**
 * Checks on entry documents (spec §5.2, §14).
 *
 * The same checks run when an entry is published or imported and when the
 * registry loads it, so a document that slipped past one gate (written by an
 * older build, say) is still caught by the other. Errors block; warnings are
 * shown to staff and do not.
 *
 * Messages are English and meant for staff and logs; `code` is what an editor
 * translates. Paths point into the document, so an editor can put the message
 * next to the field.
 */
import type { z } from "zod";

import {
  COUNTED_UNITS,
  EntryDocSchema,
  LOCALES,
  YEAR_BOUNDS,
  type EntryDoc,
  type EntryRef,
  type ParamDecl,
  type ScenarioEntry,
} from "./doc";
import { IEE_GLYPHS } from "./glyphs";
import { AVAILABLE_STAGES, hasTargetAt, momentOf, scopeOf, seesTargetAt, sourcesAt, triggerShape, triggersFor } from "./placement";
import { aboveRarity, entryPower, suggestedRarity } from "./power";
import type { EntryFacts, Stage, TriggerName } from "./runtime";
import { isSourceValue, valueRange, type ValueDoc } from "./values";
import {
  ACTIONS,
  ANSWER_OPS,
  CONDITIONS,
  TRIGGERS,
  actionDef,
  conditionDef,
  isActionOp,
  isConditionOp,
  isTriggerName,
  type ActionDoc,
  type ConditionDoc,
  type StaticEnv,
} from "./vocabulary";

/** The tag a season switches completion conditions off by (spec §4.5, §6.17). */
export const CONDITION_TAG = "game_condition";

/** The ways a reaction throws the dice again (wave B, spec §6.15): one per item. */
const THROW_OPS: readonly string[] = ["reroll", "bestOfTwo", "rerollOn"];

export type IssueCode =
  // blocking
  | "schema"
  | "unknown_trigger"
  | "unknown_condition"
  | "unknown_action"
  | "not_available"
  | "trigger_kind"
  | "condition_trigger"
  | "action_trigger"
  | "target_unavailable"
  | "param_undeclared"
  | "param_type"
  | "chance_range"
  | "missing_ref"
  | "ref_kind"
  | "kind_field"
  | "usage_required"
  | "duration_required"
  | "duration_count"
  | "charges_required"
  | "no_rules"
  | "on_use_required"
  | "held_rule_required"
  | "cursed_character"
  | "usage_field"
  | "choice_place"
  | "choice_twice"
  | "entry_choice_twice"
  | "incoming_twice"
  | "reflect_scope"
  | "or_keep_instant"
  | "reaction_target"
  | "reaction_action"
  | "reaction_only"
  | "reaction_throws"
  | "source_action"
  | "source_unavailable"
  | "pick_target"
  | "pick_unused"
  | "pick_place"
  | "year_range"
  | "open_roll_only"
  | "condition_tag"
  | "place_pick"
  | "object_unplaced"
  | "object_stop"
  | "take_item"
  | "grant_cycle"
  | "duplicate_id"
  | "duplicate_slug"
  | "scenario_item"
  | "scenario_id_taken"
  // blocking, from running the scenarios (lib/modules/iee/sim) — publish and import only
  | "scenario_failed"
  | "scenario_broken"
  // warnings
  | "name_fallback"
  | "glyph_unknown"
  | "extreme_value"
  | "param_unused"
  | "scenario_unchecked"
  | "power_above_rarity"
  | "no_counter"
  | "object_idle"
  | "duplicate_behaviour"
  | "protection_unused";

export interface Issue {
  code: IssueCode;
  path: (string | number)[];
  message: string;
  /**
   * The specifics an editor puts into its own sentence for `code` — the
   * operation, the trigger, the parameter… `message` says the same in English
   * for staff logs.
   */
  params?: Record<string, string>;
}

export interface CheckResult {
  /** The parsed document — present whenever the structure parsed, even with errors. */
  doc: EntryDoc | null;
  errors: Issue[];
  warnings: Issue[];
}

export interface CheckContext {
  /** The entry being checked — a reference to itself is a grant cycle of one. */
  entryId: string;
  /** Resolves references the way the season (or the library) will. */
  resolve: (entryId: string) => EntryFacts | null;
  /**
   * Whether to check the scenarios too (default). A season's registry does
   * not: it plays rules, and a scenario may name an entry the season does
   * not attach (§5.5).
   */
  scenarios?: boolean;
  /** The power of another entry, when known — what handing it out is worth (§14). */
  powerOf?: (entryId: string) => number | null;
}

/** Stage names as people read them. */
function stageName(stage: Stage): string {
  return stage === 1 ? "stage 1" : `wave ${stage}`;
}

function zodIssues(error: z.ZodError, base: (string | number)[]): Issue[] {
  return error.issues.map((i) => {
    const path = [...base, ...i.path.map((p) => (typeof p === "symbol" ? String(p) : p))];
    return { code: "schema" as const, path, message: i.message, params: { field: path.join(".") } };
  });
}

/** Limits past which a value still works but is probably a typo. */
const EXTREME = { steps: 6, diceSides: 6, diceCount: 2, balance: 10, result: 6 } as const;

/**
 * Checks one document on its own. Cross-entry rules — cycles longer than one,
 * duplicates, counter-play — are `checkEntrySet`'s.
 */
export function checkEntry(raw: unknown, ctx: CheckContext): CheckResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (code: IssueCode, path: (string | number)[], message: string, params?: Record<string, string>) =>
    errors.push(params ? { code, path, message, params } : { code, path, message });
  const warn = (code: IssueCode, path: (string | number)[], message: string, params?: Record<string, string>) =>
    warnings.push(params ? { code, path, message, params } : { code, path, message });

  const parsed = EntryDocSchema.safeParse(raw);
  if (!parsed.success) return { doc: null, errors: zodIssues(parsed.error, []), warnings };
  const doc = parsed.data;
  const decls: Readonly<Record<string, ParamDecl>> = doc.params ?? {};

  // --- what belongs to which kind ------------------------------------------
  if (doc.kind === "item") {
    if (!doc.usage) err("usage_required", ["usage"], "an item needs `usage`");
    if (doc.duration) {
      err("kind_field", ["duration"], "`duration` is for effects; an item lasts by its charges", { field: "duration" });
    }
    if (doc.stacking) err("kind_field", ["stacking"], "`stacking` is for effects", { field: "stacking" });
  } else {
    if (!doc.duration) err("duration_required", ["duration"], "an effect needs `duration`");
    if (doc.usage) err("kind_field", ["usage"], "`usage` is for items", { field: "usage" });
  }

  if (doc.usage && doc.kind === "item") {
    const u = doc.usage;
    // A penalty item is a cursed item, and a cursed item is a penalty (D3, spec §6.10).
    if ((u.activation === "cursed") !== (doc.character === "penalty")) {
      err(
        "cursed_character",
        ["usage", "activation"],
        u.activation === "cursed" ? "a cursed item is a penalty" : "a penalty item is cursed",
        { activation: u.activation, character: doc.character },
      );
    }
    // A reaction item acts on its holder's own throw (wave B, §6.15).
    if (u.activation === "active" && u.window === "after_dice" && (u.target?.who ?? "self") !== "self") {
      err("reaction_target", ["usage", "target", "who"], "a reaction item acts on its holder's own throw", { who: u.target?.who ?? "self" });
    }
    if (u.activation === "active") {
      if (u.charges === undefined) err("charges_required", ["usage", "charges"], "an active item needs `charges`");
      const who = u.target?.who ?? "self";
      if (u.target?.filter && who !== "other" && who !== "any") {
        err("usage_field", ["usage", "target", "filter"], "a target filter needs an item aimed at a player", {
          field: "filter",
          activation: u.activation,
        });
      }
      // A pick shapes its user's own next game (wave C, §6.16): the item aims at its user, and is used from the inventory.
      if (u.pick !== undefined && (who !== "self" || u.window === "after_dice")) {
        err("pick_target", ["usage", "pick"], "an item that asks for a pick is used on its user, from the inventory", {
          pick: u.pick,
          who,
        });
      }
    } else {
      // Never used: no moment of use and no one to aim at.
      if (u.window !== undefined) {
        err("usage_field", ["usage", "window"], `a ${u.activation} item is never used`, { field: "window", activation: u.activation });
      }
      if (u.target !== undefined) {
        err("usage_field", ["usage", "target"], `a ${u.activation} item is never aimed`, { field: "target", activation: u.activation });
      }
      if (u.pick !== undefined) {
        err("usage_field", ["usage", "pick"], `a ${u.activation} item is never used, so it asks for no pick`, { field: "pick", activation: u.activation });
      }
      if (u.activation === "cursed" && u.charges === undefined) {
        err("charges_required", ["usage", "charges"], "a cursed item needs `charges`: how many times it fires before it vanishes");
      }
    }
  }

  if (doc.duration) {
    const d = doc.duration;
    if (COUNTED_UNITS.has(d.unit) && d.count === undefined) {
      err("duration_count", ["duration", "count"], `\`${d.unit}\` needs a count`, { unit: d.unit });
    } else if (!COUNTED_UNITS.has(d.unit) && d.count !== undefined) {
      err("duration_count", ["duration", "count"], `\`${d.unit}\` takes no count`, { unit: d.unit });
    }
  }

  if (doc.stacking) {
    // No wave-A entry needed one: settled at the wave's gate (session 29).
    if (doc.stacking.group !== undefined) {
      err("not_available", ["stacking", "group"], "stacking groups arrive in wave B", { what: "group", stage: "B" });
    }
    if (doc.stacking.maxStacks !== undefined && doc.stacking.mode !== "stack") {
      err("kind_field", ["stacking", "maxStacks"], "`maxStacks` only applies to `stack`", { field: "maxStacks" });
    }
  }

  if (doc.glyph !== undefined && !IEE_GLYPHS.includes(doc.glyph)) {
    warn("glyph_unknown", ["glyph"], `glyph ${doc.glyph} is not in the icon set; the kind's glyph will show`, {
      glyph: doc.glyph,
    });
  }

  for (const locale of LOCALES) {
    if (locale !== "ru" && doc.name[locale] === undefined) {
      warn("name_fallback", ["name", locale], `no ${locale} name — the ru one is shown`, { locale });
    }
  }

  // --- rules -------------------------------------------------------------------
  if (doc.rules.length === 0) err("no_rules", ["rules"], "an entry without rules does nothing");

  const scope = scopeOf(doc);
  const usedParams = new Set<string>();
  const staticEnv: StaticEnv = {
    params: {},
    decls,
    resolve: (ref) => ctx.resolve(ref.entry),
  };
  // Defaults are what extreme-value warnings judge.
  for (const [name, decl] of Object.entries(decls)) staticEnv.params[name] = decl.default;

  const checkParams = (names: readonly string[], path: (string | number)[]) => {
    for (const name of names) {
      usedParams.add(name);
      const decl = decls[name];
      if (!decl) err("param_undeclared", path, `parameter \`${name}\` is not declared in \`params\``, { param: name });
      else if (decl.type !== "int") err("param_type", path, `parameter \`${name}\` must be an int here`, { param: name });
    }
  };

  const shape = triggerShape(doc);
  let onUseRules = 0;
  let hookRules = 0;
  let choices = 0;
  let entryChoices = 0;
  let protects = false;
  // A reaction throws the dice again one way, across all its uses' rules (§6.15).
  let throwsAgain = 0;
  // What a use's pick is remembered by: an effect it hands its user (§6.16).
  let keepsPick = false;
  // Completion conditions are the season's to switch off, by their tag (§6.17).
  let addsCondition = false;
  // An item that places itself on the board, and what it does there (wave D, §6.18).
  let placesObject = false;
  let objectRules = 0;
  // Only an effect handed out by a use remembers a pick: a held item never had one (§6.16).
  const remembersPick = doc.kind === "effect";
  doc.rules.forEach((rule, r) => {
    const rulePath: (string | number)[] = ["rules", r];
    if (!isTriggerName(rule.when)) {
      err("unknown_trigger", [...rulePath, "when"], `unknown trigger \`${rule.when}\``, { trigger: rule.when });
      return;
    }
    const trigger = TRIGGERS[rule.when];
    if (!AVAILABLE_STAGES.has(trigger.stage)) {
      err("not_available", [...rulePath, "when"], `\`${rule.when}\` arrives in ${stageName(trigger.stage)}`, {
        what: rule.when,
        stage: String(trigger.stage),
      });
    }
    if (!trigger.kinds.includes(doc.kind)) {
      err("trigger_kind", [...rulePath, "when"], `\`${rule.when}\` is not a trigger for an ${doc.kind}`, {
        trigger: rule.when,
        kind: doc.kind,
      });
    } else if (doc.kind === "effect" && doc.duration?.unit === "instant" && rule.when !== "onApply") {
      // It keeps no instance, so nothing of it is left to fire later (spec §6.4).
      err("trigger_kind", [...rulePath, "when"], `an instant effect acts on arrival only, not at \`${rule.when}\``, {
        trigger: rule.when,
        kind: "instant",
      });
    } else if (doc.kind === "item" && !triggersFor("item", { activation: shape.activation }).includes(rule.when)) {
      // Used, or working while held — never both (spec §6.10). Standing on the board is told apart below (`object_unplaced`).
      err("trigger_kind", [...rulePath, "when"], `\`${rule.when}\` is not a moment of a ${shape.activation} item`, {
        trigger: rule.when,
        kind: shape.activation ?? "active",
      });
    }
    if (rule.when === "onUse") onUseRules += 1;
    // Working while held: at the turn's hooks, answering what arrives, holding a standing state (wave B).
    if (TRIGGERS[rule.when].hook !== null || TRIGGERS[rule.when].held === true) hookRules += 1;
    // What arrives (wave B, §6.13): one answer per rule; turning back needs a rival's harmful action.
    let answers = 0;
    const harmScoped = (rule.if ?? []).some((c) => c.op === "incoming" && (c as { is?: unknown }).is === "harm");

    (rule.if ?? []).forEach((raw, c) => {
      const path = [...rulePath, "if", c];
      if (!isConditionOp(raw.op)) {
        err("unknown_condition", path, `unknown condition \`${raw.op}\``, { op: raw.op });
        return;
      }
      const def = CONDITIONS[raw.op];
      const parsedCond = def.schema.safeParse(raw);
      if (!parsedCond.success) {
        errors.push(...zodIssues(parsedCond.error, path));
        return;
      }
      const cond = parsedCond.data as ConditionDoc;
      if (!AVAILABLE_STAGES.has(def.stage)) {
        err("not_available", path, `\`${raw.op}\` arrives in ${stageName(def.stage)}`, {
          what: raw.op,
          stage: String(def.stage),
        });
      }
      // A reaction item's use sees the dice as `afterDice` does (wave B, §6.15).
      if (!(def.triggers as readonly string[]).includes(momentOf(scope, rule.when))) {
        err("condition_trigger", path, `\`${raw.op}\` cannot be checked at \`${rule.when}\``, {
          op: raw.op,
          trigger: rule.when,
        });
      }
      const typed = conditionDef(cond);
      // An effect's rules at the turn's hooks may read whom its item was aimed at (§6.11).
      if (typed.needsTarget(cond) && !seesTargetAt(scope, rule.when, typed.remembered === true)) {
        err("target_unavailable", path, "there is no chosen player here", { op: raw.op });
      }
      checkParams(typed.paramsUsed(cond), path);
      if (cond.op === "chance") {
        const percent = cond.percent;
        if (typeof percent === "number") {
          if (percent < 1 || percent > 99) err("chance_range", path, "a chance is 1–99 %");
        } else {
          const decl = decls[percent.param];
          if (decl && decl.type === "int" && ((decl.min ?? 0) < 1 || (decl.max ?? 100) > 99)) {
            err("chance_range", path, `parameter \`${percent.param}\` must be bounded to 1–99`, { param: percent.param });
          }
        }
      }
      if (cond.op === "hasEntry" && cond.entry) {
        if (ctx.resolve(cond.entry.entry) === null && cond.entry.entry !== ctx.entryId) {
          err("missing_ref", [...path, "entry"], `entry ${cond.entry.slug ?? cond.entry.entry} is not available`, {
            entry: cond.entry.slug ?? cond.entry.entry,
          });
        }
      }
    });

    rule.do.forEach((raw, a) => {
      const path = [...rulePath, "do", a];
      if (!isActionOp(raw.op)) {
        err("unknown_action", path, `unknown action \`${raw.op}\``, { op: raw.op });
        return;
      }
      const def = ACTIONS[raw.op];
      const parsedAction = def.schema.safeParse(raw);
      if (!parsedAction.success) {
        errors.push(...zodIssues(parsedAction.error, path));
        return;
      }
      const action = parsedAction.data as ActionDoc;
      const typed = actionDef(action);
      if (!AVAILABLE_STAGES.has(typed.stage)) {
        err("not_available", path, `\`${raw.op}\` arrives in ${stageName(typed.stage)}`, {
          what: raw.op,
          stage: String(typed.stage),
        });
      }
      if (scope.reaction && rule.when === "onUse") {
        // A reaction item's use acts on the throw, and on nothing else (wave B, §6.15).
        if (typed.reacts !== true) {
          err("reaction_action", path, "a reaction item's use acts on the dice only: reroll, bestOfTwo, rerollOn or resultModify", { op: raw.op });
        } else if (THROW_OPS.includes(action.op) && ++throwsAgain > 1) {
          err("reaction_throws", path, "a reaction throws the dice again one way: reroll, bestOfTwo or rerollOn", { op: raw.op });
        }
      } else if (typed.reactionOnly) {
        err("reaction_only", path, `\`${raw.op}\` stands only at a reaction item's use`, { op: raw.op });
      } else if (!typed.triggers.includes(rule.when as TriggerName)) {
        err("action_trigger", path, `\`${raw.op}\` cannot run at \`${rule.when}\``, { op: raw.op, trigger: rule.when });
      } else if (typed.openRollOnly && scope.openRoll !== true) {
        // The game in flight (wave C, §6.16): only a use on an open roll has one to act on.
        err("open_roll_only", path, `\`${raw.op}\` acts on the game in flight — an item used on an open roll only`, { op: raw.op });
      }
      if (typed.needsTarget(action) && !hasTargetAt(scope, rule.when)) {
        err("target_unavailable", path, "there is no chosen player here", { op: raw.op });
      }
      // A number read from the moment (§6.5): only where the sentence can say it, and the moment knows it.
      for (const [field, value] of Object.entries(action)) {
        if (!isSourceValue(value)) continue;
        if (!(typed.sourceFields ?? []).includes(field)) {
          err("source_action", [...path, field], `\`${raw.op}\` cannot read \`${value.source}\``, { op: raw.op, source: value.source });
        } else if (!sourcesAt(scope, rule.when).includes(value.source)) {
          err("source_unavailable", [...path, field], `\`${value.source}\` cannot be read at \`${rule.when}\``, {
            source: value.source,
            trigger: rule.when,
          });
        }
      }
      // A choice is the user's, made as they use the item (spec §6.10).
      if (action.op === "remove" && action.pick === "choice") {
        choices += 1;
        if (doc.kind !== "item" || rule.when !== "onUse") {
          err("choice_place", [...path, "pick"], "only an item's use has someone to choose", { op: raw.op, trigger: rule.when });
        } else if (choices > 1) {
          err("choice_twice", [...path, "pick"], "an item asks for one choice per use", { op: raw.op });
        }
      }
      // So is a pick from the season's catalog — one per use (spec §6.12); `onUse` only, by its triggers.
      if (action.op === "grantChosen") {
        entryChoices += 1;
        if (entryChoices > 1) err("entry_choice_twice", path, "an item asks for one pick from the catalog per use", { op: raw.op });
      }
      if (ANSWER_OPS.includes(action.op)) {
        answers += 1;
        if (answers > 1) err("incoming_twice", path, "a rule answers what arrives one way: block, reflect, amplify or replace", { op: raw.op });
      }
      if (action.op === "reflect" && !harmScoped) {
        err("reflect_scope", path, "only a rival's harmful action can be turned back — check `incoming` is harm", { op: raw.op });
      }
      if (action.op === "block" || action.op === "reflect") protects = true;
      if (action.op === "addCondition") addsCondition = true;
      if (action.op === "grantEffect" && action.to === "self" && rule.when === "onUse") keepsPick = true;
      if (action.op === "placeObject") placesObject = true;
      // The next game (§6.16): what reads a pick needs something that remembers one; a year a parameter sets stays a year.
      if (action.op === "poolExclude" || action.op === "poolRequire" || action.op === "poolFavor") {
        const readsPick = typed.readsPick === true || (action.op !== "poolFavor" && (action.genres === "picked" || action.years === "picked"));
        if (readsPick && !remembersPick) {
          err("pick_place", path, "only an effect remembers a pick — one an item's use hands its user", { op: raw.op });
        }
        if (action.op !== "poolFavor" && action.years !== undefined && action.years !== "picked") {
          for (const bound of [action.years.min, action.years.max]) {
            if (bound === undefined || typeof bound === "number") continue;
            const decl = decls[bound.param];
            if (decl && decl.type === "int" && ((decl.min ?? YEAR_BOUNDS.min - 1) < YEAR_BOUNDS.min || (decl.max ?? YEAR_BOUNDS.max + 1) > YEAR_BOUNDS.max)) {
              err("year_range", path, `parameter \`${bound.param}\` must be bounded to ${YEAR_BOUNDS.min}–${YEAR_BOUNDS.max}`, { param: bound.param });
            }
          }
        }
      }
      // Giving instead of keeping needs something kept (§6.14): an instant effect keeps nothing.
      if (action.op === "victimChoice" && action.orKeep && doc.kind === "effect" && doc.duration?.unit === "instant") {
        err("or_keep_instant", [...path, "orKeep"], "an instant effect keeps nothing to be rid of", { op: raw.op });
      }
      checkParams(typed.paramsUsed(action), path);
      for (const { ref, kind } of typed.refs(action)) {
        if (ref.entry === ctx.entryId) {
          err("grant_cycle", [...path, "entry"], "an entry cannot hand out itself");
          continue;
        }
        const facts = ctx.resolve(ref.entry);
        if (!facts) {
          err("missing_ref", [...path, "entry"], `entry ${ref.slug ?? ref.entry} is not available`, {
            entry: ref.slug ?? ref.entry,
          });
        } else if (facts.kind !== kind) {
          err("ref_kind", [...path, "entry"], `\`${raw.op}\` needs an ${kind}, ${facts.slug} is an ${facts.kind}`, {
            op: raw.op,
            kind,
            entry: facts.slug,
          });
        }
      }
      extremeWarnings(action, staticEnv, path, warn);
    });
  });

  // What an object does (wave D, §6.18): a push and a wheel in place of the cell follow a stop; a stopped move goes no further.
  doc.rules.forEach((rule, r) => {
    if (rule.when !== "onObjectEntered") return;
    objectRules += 1;
    const ops = rule.do.map((a) => a.op);
    const stops = ops.includes("stopMove");
    rule.do.forEach((a, i) => {
      const path = ["rules", r, "do", i];
      if ((a.op === "push" || a.op === "spinInstead") && !stops) {
        err("object_stop", path, `\`${a.op}\` acts on a stopped move — add \`stopMove\` to the rule`, { op: a.op });
      }
      if (a.op === "extend" && stops) err("object_stop", path, "a move that stops goes no further — `extend` or `stopMove`, not both", { op: a.op });
    });
  });
  if (doc.kind === "item" && shape.activation === "active" && objectRules > 0 && !placesObject) {
    err("object_unplaced", ["rules"], "the rules at `onObjectEntered` run once the item stands on the board — add `placeObject` to its use");
  }
  if (placesObject && doc.kind === "item" && doc.usage?.pick !== "cell") {
    err("place_pick", ["usage", "pick"], 'an item that places itself asks for the cell — `usage.pick: "cell"`', { pick: doc.usage?.pick ?? "" });
  }
  if (!placesObject && doc.kind === "item" && doc.usage?.pick === "cell") {
    err("place_pick", ["usage", "pick"], "only an item that places itself asks for a cell — add `placeObject` to its use", { pick: "cell" });
  }
  // What changes hands is an item (wave D, §6.19): an effect cannot be taken.
  if (doc.kind === "effect") {
    doc.rules.forEach((rule, r) =>
      rule.do.forEach((a, i) => {
        if (a.op === "takeEntry") err("take_item", ["rules", r, "do", i], "only an item changes hands — an effect cannot be taken", { op: a.op });
      }),
    );
  }
  if (placesObject && doc.kind === "item" && objectRules === 0) warn("object_idle", ["rules"], "an object without rules at `onObjectEntered` stands on the board doing nothing");

  // A season switches completion conditions off by their tag (§4.5, §6.17): an entry that adds one carries it.
  if (addsCondition && !doc.tags.includes(CONDITION_TAG)) {
    err("condition_tag", ["tags"], `an entry that adds completion conditions carries the tag \`${CONDITION_TAG}\` — the season's switch for them`, {
      tag: CONDITION_TAG,
    });
  }

  // A pick nothing remembers is asked of the player for nothing (§6.16); a cell is where the item places itself (§6.18).
  if (doc.kind === "item" && shape.activation === "active" && doc.usage?.pick !== undefined && doc.usage.pick !== "cell" && !keepsPick) {
    err("pick_unused", ["usage", "pick"], "a pick is remembered by the effect the use hands its user — add `grantEffect` to yourself", {
      pick: doc.usage.pick,
    });
  }

  if (doc.kind === "item" && doc.rules.length > 0) {
    if (shape.activation === "active" && onUseRules === 0) {
      err("on_use_required", ["rules"], "an active item needs an `onUse` rule");
    }
    if (shape.activation !== "active" && hookRules === 0) {
      err("held_rule_required", ["rules"], `a ${shape.activation} item needs a rule at a turn hook, at \`onIncoming\` or \`whileActive\` — that is how it works while held`, {
        activation: shape.activation ?? "active",
      });
    }
  }

  for (const name of Object.keys(decls)) {
    if (!usedParams.has(name)) warn("param_unused", ["params", name], `parameter \`${name}\` is never used`, { param: name });
  }

  // A tier holds a block or a reflection against pierce (§6.13); with neither it does nothing.
  if (doc.protection && !protects) {
    warn("protection_unused", ["protection"], "a protection tier does nothing without `block` or `reflect`");
  }

  // More power than the rarity carries (§14): a warning — the author may mean it.
  if (doc.rules.length > 0) {
    const power = entryPower(doc, { resolve: (ref) => ctx.resolve(ref.entry), powerOf: ctx.powerOf });
    if (aboveRarity(power, doc.rarity)) {
      const suggested = suggestedRarity(power);
      warn("power_above_rarity", ["rarity"], `power ${power.toFixed(1)} is more than ${doc.rarity} carries; it reads as ${suggested}`, {
        power: power.toFixed(1),
        rarity: doc.rarity,
        suggested,
      });
    }
  }

  if (ctx.scenarios !== false) checkScenarios(doc, ctx, err, warn);

  return { doc, errors, warnings };
}

/**
 * What can be said about the scenarios without running them (§5.5): the
 * entries they name exist, a use step uses an item, ids are unique. Running
 * them is the library's (`lib/modules/iee/sim`): it needs the executor.
 */
function checkScenarios(
  doc: EntryDoc,
  ctx: CheckContext,
  err: (code: IssueCode, path: (string | number)[], message: string, params?: Record<string, string>) => void,
  warn: (code: IssueCode, path: (string | number)[], message: string, params?: Record<string, string>) => void,
): void {
  const ids = new Set<string>();
  const known = (ref: EntryRef) => ref.entry === ctx.entryId || ctx.resolve(ref.entry) !== null;
  const named = (entry: ScenarioEntry, path: (string | number)[]) => {
    if (entry === "self" || known(entry)) return;
    err("missing_ref", path, `entry ${entry.slug ?? entry.entry} is not available`, { entry: entry.slug ?? entry.entry });
  };
  (doc.scenarios ?? []).forEach((scenario, s) => {
    const base: (string | number)[] = ["scenarios", s];
    if (scenario.steps.every((step) => Object.keys(step.expect ?? {}).length === 0)) {
      warn("scenario_unchecked", base, `scenario ${s + 1} checks nothing`, { scenario: String(s + 1) });
    }
    if (scenario.id !== undefined) {
      if (ids.has(scenario.id)) err("scenario_id_taken", [...base, "id"], `scenario id ${scenario.id} is used twice`, { id: scenario.id });
      ids.add(scenario.id);
    }
    for (const side of ["holder", "rival"] as const) {
      scenario.given?.[side]?.carries?.forEach((c, i) => named(c.entry, [...base, "given", side, "carries", i, "entry"]));
    }
    scenario.steps.forEach((step, n) => {
      const path = [...base, "steps", n];
      if (step.do === "grant") named(step.entry, [...path, "entry"]);
      if (step.do === "use") {
        if (step.choose !== undefined) named(step.choose, [...path, "choose"]);
        if (step.chooseEntry !== undefined) named(step.chooseEntry, [...path, "chooseEntry"]);
        if (step.item === undefined) {
          if (doc.kind !== "item") {
            err("scenario_item", [...path, "item"], "an effect is not used — name the item the step uses", { entry: doc.slug });
          }
        } else if (!known(step.item)) {
          named(step.item, [...path, "item"]);
        } else {
          const kind = step.item.entry === ctx.entryId ? doc.kind : ctx.resolve(step.item.entry)?.kind;
          const label = step.item.slug ?? step.item.entry;
          if (kind !== "item") err("scenario_item", [...path, "item"], `${label} is not an item`, { entry: label });
        }
      }
      for (const side of ["holder", "rival"] as const) {
        step.expect?.[side]?.forEach((h, i) => named(h.entry, [...path, "expect", side, i, "entry"]));
      }
    });
  });
}

function extremeWarnings(
  action: ActionDoc,
  env: StaticEnv,
  path: (string | number)[],
  warn: (code: IssueCode, path: (string | number)[], message: string, params?: Record<string, string>) => void,
): void {
  const beyond = (value: ValueDoc | undefined, limit: number) => {
    if (value === undefined) return false;
    const r = valueRange(value, env.params, env.decls);
    return Math.max(Math.abs(r.min), Math.abs(r.max)) > limit;
  };
  if (action.op === "steps" && beyond(action.delta, EXTREME.steps)) {
    warn("extreme_value", path, `more than ${EXTREME.steps} cells is a lot on a d6`, {
      what: "steps",
      limit: String(EXTREME.steps),
    });
  }
  if (action.op === "dice" && beyond(action.sides, EXTREME.diceSides)) {
    warn("extreme_value", path, `more than ${EXTREME.diceSides} sides changes the game's pace a lot`, {
      what: "diceSides",
      limit: String(EXTREME.diceSides),
    });
  }
  if (action.op === "dice" && beyond(action.count, EXTREME.diceCount)) {
    warn("extreme_value", path, `more than ${EXTREME.diceCount} extra dice changes the game's pace a lot`, {
      what: "diceCount",
      limit: String(EXTREME.diceCount),
    });
  }
  if (action.op === "resultModify" && beyond(action.delta, EXTREME.result)) {
    warn("extreme_value", path, `more than ${EXTREME.result} on a dice result is a lot on a d6`, {
      what: "result",
      limit: String(EXTREME.result),
    });
  }
  if (action.op === "balance" && beyond(action.amount, EXTREME.balance)) {
    warn("extreme_value", path, `more than ${EXTREME.balance} points at once`, {
      what: "balance",
      limit: String(EXTREME.balance),
    });
  }
}

// ---------------------------------------------------------------------------
// Whole sets
// ---------------------------------------------------------------------------

export interface SetMember {
  entryId: string;
  doc: EntryDoc;
}

/** Entry ids an entry hands out, by any rule. */
export function grantsOf(doc: EntryDoc): string[] {
  const out: string[] = [];
  for (const rule of doc.rules) {
    for (const raw of rule.do) {
      if (raw.op !== "grantEffect" && raw.op !== "grantItem") continue;
      const entry = (raw as { entry?: { entry?: unknown } }).entry?.entry;
      if (typeof entry === "string") out.push(entry);
    }
  }
  return out;
}

/** Canonical behaviour of an entry — what two duplicates would share. */
function behaviourOf(doc: EntryDoc): string {
  return JSON.stringify({
    kind: doc.kind,
    usage: doc.usage ?? null,
    duration: doc.duration ?? null,
    stacking: doc.stacking ?? null,
    rules: doc.rules,
    params: doc.params ?? null,
  });
}

/**
 * Checks that only make sense across entries: identity, grant cycles,
 * counter-play and duplicates. Members are assumed to have passed
 * `checkEntry`.
 */
export function checkEntrySet(members: readonly SetMember[]): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const ids = new Set<string>();
  const slugs = new Map<string, string>();
  for (const m of members) {
    if (ids.has(m.entryId)) {
      errors.push({
        code: "duplicate_id",
        path: [m.doc.slug],
        message: `entry id ${m.entryId} appears twice`,
        params: { entry: m.doc.slug },
      });
    }
    ids.add(m.entryId);
    const other = slugs.get(m.doc.slug);
    if (other !== undefined && other !== m.entryId) {
      errors.push({
        code: "duplicate_slug",
        path: [m.doc.slug],
        message: `slug ${m.doc.slug} appears twice`,
        params: { entry: m.doc.slug },
      });
    }
    slugs.set(m.doc.slug, m.entryId);
  }

  // Grant cycles: depth-first search over "A hands out B".
  const byId = new Map(members.map((m) => [m.entryId, m]));
  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    const mark = state.get(id);
    if (mark === "done") return;
    if (mark === "visiting") {
      const cycle = trail.slice(trail.indexOf(id));
      const key = [...cycle].sort().join(",");
      if (!reported.has(key)) {
        reported.add(key);
        const names = cycle.map((c) => byId.get(c)?.doc.slug ?? c);
        const loop = [...names, names[0]].join(" → ");
        const message = `entries hand each other out in a loop: ${loop}`;
        // One issue per member, so each entry shows it and each is disabled.
        for (const name of names) errors.push({ code: "grant_cycle", path: [name], message, params: { loop } });
      }
      return;
    }
    state.set(id, "visiting");
    const member = byId.get(id);
    for (const next of member ? grantsOf(member.doc) : []) {
      if (byId.has(next)) visit(next, [...trail, id]);
    }
    state.set(id, "done");
  };
  for (const m of members) visit(m.entryId, []);

  // Counter-play: every penalty effect should be removable by something.
  const cleansers = members.flatMap((m) =>
    m.doc.rules.flatMap((rule) =>
      rule.do.filter((a) => a.op === "cleanse").map((a) => a as Extract<ActionDoc, { op: "cleanse" }>),
    ),
  );
  for (const m of members) {
    if (m.doc.kind !== "effect" || m.doc.character !== "penalty") continue;
    const answered = cleansers.some(
      (c) =>
        (c.character === undefined || c.character === "penalty") &&
        (c.tags === undefined || c.tags.some((t) => m.doc.tags.includes(t))),
    );
    if (!answered) {
      warnings.push({
        code: "no_counter",
        path: [m.doc.slug],
        message: `nothing removes the penalty effect ${m.doc.slug}`,
        params: { entry: m.doc.slug },
      });
    }
  }

  // Duplicates: the same behaviour under two names is a balancing trap.
  const seen = new Map<string, string>();
  for (const m of members) {
    const key = behaviourOf(m.doc);
    const first = seen.get(key);
    if (first !== undefined) {
      warnings.push({
        code: "duplicate_behaviour",
        path: [m.doc.slug],
        message: `${m.doc.slug} behaves exactly like ${first}`,
        params: { entry: m.doc.slug, other: first },
      });
    } else seen.set(key, m.doc.slug);
  }

  return { errors, warnings };
}
