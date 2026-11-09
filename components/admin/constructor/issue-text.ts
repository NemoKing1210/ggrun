import type { Issue } from "@/lib/engine/iee/dsl";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { VALUE_FIELDS } from "@/lib/modules/iee/library/draft";

/** An issue as the checks return it — the engine's codes plus the library's own. */
export type AnyIssue = Omit<Issue, "code"> & { code: string };

type Labelled = Record<string, { label: string } | undefined>;

/** The name a person reads for a primitive's identifier: a trigger, a condition or an action. */
export function primitiveLabel(id: string, t: Dictionary): string {
  const v = t.ieeEditor.vocab;
  return (
    (v.triggers as Labelled)[id]?.label ??
    (v.conditions as Labelled)[id]?.label ??
    (v.actions as Labelled)[id]?.label ??
    id
  );
}

/** A shape error, said in terms of the field the editor shows. */
function schemaText(issue: AnyIssue, t: Dictionary): string {
  const f = t.ieeEditor.issues.fields;
  const path = issue.path;
  const last = path[path.length - 1];
  if (path[0] === "name" && path[1] === "ru") return f.nameRu;
  if (path[0] === "rules" && typeof path[1] === "number") {
    if (path.length === 3 && path[2] === "when") return f.ruleWhen;
    if (path.length === 3 && path[2] === "do") return f.ruleDo;
    if (last === "entry") return f.entry;
    const part = path[2];
    const item = path[3];
    if ((part === "do" || part === "if") && typeof item === "number" && typeof path[4] === "string") {
      // A number field of a primitive: a literal, a parameter or a range.
      const fields = Object.values(VALUE_FIELDS).flat();
      if (fields.includes(path[4])) return f.value;
    }
  }
  if (path[0] === "scenarios" && typeof path[1] === "number") {
    if (path[2] === "title") return f.scenarioTitle;
    if (path[2] === "note") return f.scenarioNote;
    if (path[2] === "id") return f.scenarioId;
    if (path.length === 3 && path[2] === "steps") return f.scenarioSteps;
    if (last === "entry") return f.entry;
    if (typeof last === "string" && SCENARIO_NUMBERS.has(last)) return f.value;
  }
  return format(t.ieeEditor.issues.schema, { field: path.join(".") || "—" });
}

/** The whole numbers a scenario holds: in Given, in a step, in its checks. */
const SCENARIO_NUMBERS = new Set([
  "position",
  "rivalPosition",
  "balance",
  "count",
  "sides",
  "dice",
  "moved",
  "diceCount",
  "diceSides",
  "rivalBalance",
  "lastRoll",
  "objects",
  "cell",
]);

/**
 * A value a scenario expected or observed, as the scenarios block says it:
 * booleans, wheels, results and refusals in words (spec §5.5).
 */
export function scenarioValueText(field: string, value: string, t: Dictionary): string {
  const sc = t.ieeEditor.entry.scenarios;
  if (value === "nothing") return sc.nothing;
  if (field === "cellFires") return value === "true" ? sc.yes : value === "false" ? sc.no : value;
  if (field === "wheel" || field === "wheelAgain") return (sc.wheel as Record<string, string>)[value] ?? value;
  if (field === "result") return (sc.results as Record<string, string>)[value] ?? value;
  if (field === "reason") return (t.core.errors as Record<string, string>)[value] ?? value;
  return value;
}

/**
 * A check's finding in the reader's language. The checks carry the specifics
 * in `params` (spec §14); identifiers in them become the names the forms use.
 */
export function issueText(issue: AnyIssue, t: Dictionary): string {
  if (issue.code === "schema") return schemaText(issue, t);
  const params: Record<string, string> = { ...(issue.params ?? {}) };
  if (issue.code === "scenario_failed" && params.field) {
    const field = params.field;
    params.expected = scenarioValueText(field, params.expected ?? "", t);
    params.actual = scenarioValueText(field, params.actual ?? "", t);
    const label = (t.ieeEditor.entry.scenarios.checks as Record<string, string>)[field] ?? field;
    params.field = params.entry ? `${label} (${params.entry})` : label;
  }
  if (issue.code === "scenario_broken" && params.reason) {
    const template = (t.ieeEditor.entry.scenarios.broken as Record<string, string>)[params.reason];
    if (template) params.reason = format(template, params);
  }
  if (params.op) params.op = primitiveLabel(params.op, t);
  if (params.trigger) params.trigger = primitiveLabel(params.trigger, t);
  if (params.what) params.what = primitiveLabel(params.what, t);
  if (params.source) params.source = (t.ieeEditor.entry.value.sources as Record<string, string>)[params.source] ?? params.source;
  if (params.locale) params.locale = (t.ieeEditor.locales as Record<string, string>)[params.locale] ?? params.locale;
  if (issue.code === "power_above_rarity") {
    const rarity = t.iee.rarity as Record<string, string>;
    if (params.rarity) params.rarity = rarity[params.rarity] ?? params.rarity;
    if (params.suggested) params.suggested = rarity[params.suggested] ?? params.suggested;
  }
  const template = (t.ieeEditor.issues as unknown as Record<string, unknown>)[issue.code];
  return typeof template === "string" ? format(template, params) : issue.message;
}
