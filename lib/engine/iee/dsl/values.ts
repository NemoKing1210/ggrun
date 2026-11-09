/**
 * Numbers inside rules (spec §6.5).
 *
 * A number is a literal, a declared parameter the season may override, a
 * server-side random draw, a die rolled on a table, or a source — something
 * the moment the rule runs in knows (the dice, the items held, the chosen
 * player's last roll). There are no expressions on purpose: a mechanic that
 * needs a formula becomes a new value source in code, with tests.
 */
import { z } from "zod";

import type { IeeParams } from "../../types/iee";
import { CHARACTERS, PARAM_NAME_RE, type ParamDecl } from "./doc";
import { meanHeld, meanRoll, type PlayContext } from "./play-model";

const BOUND = 1000;

/**
 * A die rolled on a table (wave A, «Кубик хаоса»): the server rolls a `die`,
 * and the first row whose `upTo` the roll does not exceed gives the value.
 * Rows go up strictly and the last one covers the die's highest face.
 */
export const TableValueSchema = z
  .strictObject({
    table: z.strictObject({
      die: z.number().int().min(2).max(100),
      rows: z
        .array(
          z.strictObject({
            upTo: z.number().int().min(1).max(100),
            value: z.number().int().min(-BOUND).max(BOUND),
          }),
        )
        .min(2)
        .max(12),
    }),
  })
  .refine((v) => v.table.rows.every((row, i, rows) => i === 0 || row.upTo > rows[i - 1]!.upTo), {
    message: "table rows must go up",
  })
  .refine((v) => v.table.rows[v.table.rows.length - 1]!.upTo === v.table.die, {
    message: "the last table row must cover the die's highest face",
  });
export type TableValueDoc = z.infer<typeof TableValueSchema>;

/** What a source reads (wave A, spec §6.5). */
export const VALUE_SOURCES = ["diceSum", "itemCount", "targetLastRoll"] as const;
export type ValueSourceName = (typeof VALUE_SOURCES)[number];

/**
 * A number the moment knows (wave A): the sum of the dice of the roll in
 * progress, the items the holder has — of a character, so many per item —
 * or the dice sum of the chosen player's last regular move. Read where the
 * rule runs; a source that cannot be read there is refused by the checks.
 */
export const SourceValueSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("diceSum") }),
  z.strictObject({
    source: z.literal("itemCount"),
    /** Only items of this character: bonus ones, or penalty (cursed) ones. All when absent. */
    character: z.enum(CHARACTERS).optional(),
    /** So much per item, signed: «Бремя» takes 1 a item. */
    multiplier: z
      .number()
      .int()
      .min(-10)
      .max(10)
      .refine((n) => n !== 0, { message: "a multiplier of 0 counts nothing" }),
  }),
  z.strictObject({ source: z.literal("targetLastRoll") }),
]);
export type SourceValueDoc = z.infer<typeof SourceValueSchema>;

export const ValueSchema = z.union([
  z.number().int().min(-BOUND).max(BOUND),
  z.strictObject({ param: z.string().regex(PARAM_NAME_RE) }),
  z
    .strictObject({
      random: z.tuple([z.number().int().min(-BOUND).max(BOUND), z.number().int().min(-BOUND).max(BOUND)]),
    })
    .refine((v) => v.random[0] <= v.random[1], { message: "random range must be [low, high]" }),
  TableValueSchema,
  SourceValueSchema,
]);
export type ValueDoc = z.infer<typeof ValueSchema>;

/** Whether a value is rolled on a table. */
export function isTableValue(value: ValueDoc | undefined): value is TableValueDoc {
  return typeof value === "object" && value !== null && "table" in value;
}

/** Whether a value is read from the moment (a source). */
export function isSourceValue(value: unknown): value is SourceValueDoc {
  return typeof value === "object" && value !== null && "source" in value;
}

/** The source a value reads, if it reads one. */
export function valueSource(value: unknown): ValueSourceName | null {
  return isSourceValue(value) ? value.source : null;
}

/** The share of a table's die each row takes, in order. */
export function tableShares(table: TableValueDoc["table"]): { from: number; upTo: number; value: number; share: number }[] {
  let from = 1;
  return table.rows.map((row) => {
    const out = { from, upTo: row.upTo, value: row.value, share: (row.upTo - from + 1) / table.die };
    from = row.upTo + 1;
    return out;
  });
}

/** A value that cannot be random — counts and percentages. */
export const FixedValueSchema = z.union([
  z.number().int().min(-BOUND).max(BOUND),
  z.strictObject({ param: z.string().regex(PARAM_NAME_RE) }),
]);
export type FixedValueDoc = z.infer<typeof FixedValueSchema>;

export interface ValueEnv {
  /** Parameter values in force: declaration defaults with the season's overrides. */
  params: IeeParams;
  decls: Readonly<Record<string, ParamDecl>>;
  rng: () => number;
  /**
   * What a source reads where the rule runs; null when it cannot be read
   * there (no dice yet, nobody chosen, a player who has not moved). An
   * unreadable source is worth 0.
   */
  read?: (source: SourceValueDoc) => number | null;
}

/** The number a parameter stands for; an unusable value falls back to its default. */
export function paramNumber(
  name: string,
  params: IeeParams,
  decls: Readonly<Record<string, ParamDecl>>,
): number {
  const decl = decls[name];
  const fallback = decl && decl.type === "int" ? decl.default : 0;
  const raw = params[name];
  if (typeof raw !== "number" || !Number.isInteger(raw)) return fallback;
  if (decl && decl.type === "int") {
    if ((decl.min !== undefined && raw < decl.min) || (decl.max !== undefined && raw > decl.max)) {
      return fallback;
    }
  }
  return raw;
}

/** Evaluates a value. `random` draws from the injected rng — never `Math.random`. */
export function resolveValue(value: ValueDoc, env: ValueEnv): number {
  if (typeof value === "number") return value;
  if ("param" in value) return paramNumber(value.param, env.params, env.decls);
  if ("table" in value) {
    const roll = 1 + Math.floor(env.rng() * value.table.die);
    return (value.table.rows.find((row) => roll <= row.upTo) ?? value.table.rows[value.table.rows.length - 1]!).value;
  }
  if ("source" in value) return Math.round(env.read?.(value) ?? 0);
  const [low, high] = value.random;
  return low + Math.floor(env.rng() * (high - low + 1));
}

/** What a value can come out as — for rule text and power, never for play. */
export type ValueRange = { min: number; max: number };

/**
 * What a source comes out as in ordinary play — the play model's mean, since
 * nothing bounds it before the rule runs (spec §14): a roll's dice sum on the
 * turns the rule fires on, so many per item held.
 */
export function sourceMean(source: SourceValueDoc, play: Pick<PlayContext, "outcome"> = { outcome: null }): number {
  switch (source.source) {
    case "diceSum":
      return meanRoll(play.outcome);
    // Their last roll was a pass or a drop, whatever the holder's is.
    case "targetLastRoll":
      return meanRoll(null);
    case "itemCount":
      return meanHeld(source.character ?? null) * source.multiplier;
  }
}

export function valueRange(
  value: ValueDoc,
  params: IeeParams,
  decls: Readonly<Record<string, ParamDecl>>,
  play?: Pick<PlayContext, "outcome">,
): ValueRange {
  if (typeof value === "number") return { min: value, max: value };
  if ("param" in value) {
    const n = paramNumber(value.param, params, decls);
    return { min: n, max: n };
  }
  if ("table" in value) {
    const values = value.table.rows.map((row) => row.value);
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  if ("source" in value) {
    const mean = sourceMean(value, play);
    return { min: mean, max: mean };
  }
  return { min: value.random[0], max: value.random[1] };
}

/** What a value comes out as on average — for power, never for play. */
export function valueMean(
  value: ValueDoc,
  params: IeeParams,
  decls: Readonly<Record<string, ParamDecl>>,
  play?: Pick<PlayContext, "outcome">,
): number {
  if (typeof value === "object" && "table" in value) {
    return tableShares(value.table).reduce((acc, row) => acc + row.share * row.value, 0);
  }
  const r = valueRange(value, params, decls, play);
  return (r.min + r.max) / 2;
}

/** Parameter names a value refers to. */
export function valueParams(value: ValueDoc | undefined): string[] {
  if (value === undefined || typeof value === "number") return [];
  return "param" in value ? [value.param] : [];
}

/** Defaults of every declared parameter — the instance snapshot before overrides. */
export function paramDefaults(decls: Readonly<Record<string, ParamDecl>> | undefined): IeeParams {
  const out: IeeParams = {};
  for (const [name, decl] of Object.entries(decls ?? {})) out[name] = decl.default;
  return out;
}

export type OverrideProblem = { param: string; reason: "unknown" | "type" | "range" | "value" };

/**
 * Applies a season's overrides to the declared defaults.
 *
 * Unknown names and values that break the declaration are dropped and reported
 * rather than applied: a typo in a season's tuning must not change what an entry
 * does, and it must not fail a turn either (spec §5.1).
 */
export function resolveParamOverrides(
  decls: Readonly<Record<string, ParamDecl>> | undefined,
  overrides: IeeParams | undefined,
): { params: IeeParams; problems: OverrideProblem[] } {
  const params = paramDefaults(decls);
  const problems: OverrideProblem[] = [];
  for (const [name, value] of Object.entries(overrides ?? {})) {
    const decl = decls?.[name];
    if (!decl) {
      problems.push({ param: name, reason: "unknown" });
      continue;
    }
    if (decl.type === "int") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        problems.push({ param: name, reason: "type" });
        continue;
      }
      if ((decl.min !== undefined && value < decl.min) || (decl.max !== undefined && value > decl.max)) {
        problems.push({ param: name, reason: "range" });
        continue;
      }
    } else if (decl.type === "bool") {
      if (typeof value !== "boolean") {
        problems.push({ param: name, reason: "type" });
        continue;
      }
    } else {
      if (typeof value !== "string") {
        problems.push({ param: name, reason: "type" });
        continue;
      }
      if (!decl.values.includes(value)) {
        problems.push({ param: name, reason: "value" });
        continue;
      }
    }
    params[name] = value;
  }
  return { params, problems };
}
