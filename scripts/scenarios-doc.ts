/**
 * Generates `docs/ITEMS_EFFECTS_SCENARIOS.md` from the system pack `core`
 * (`seed/iee/core.ggpack`, read through its generated fixture
 * `lib/engine/iee/core-docs`) and the subsystem table
 * `lib/engine/iee/scenarios.ts`.
 *
 * An entry's promises are the scenarios in its document (spec §5.5): data that
 * publishing, importing and `pnpm test` run. The table keeps what no entry can
 * say on its own — rules across the subsystem, and the live tier. The
 * reference is generated rather than written so it cannot describe behaviour
 * the code does not have; edit the pack or the table, not the markdown.
 *
 *   pnpm scenarios:doc
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SCENARIOS, type Scenario } from "@/lib/engine/iee";
import { CORE_DOCS } from "@/lib/engine/iee/core-docs";
import {
  compileSet,
  isEffect,
  isItem,
  scenarioText,
  type CompiledEffect,
  type ScenarioDoc,
  type ScenarioEntry,
} from "@/lib/engine/iee/dsl";

const OUT = resolve(process.cwd(), "docs/ITEMS_EFFECTS_SCENARIOS.md");

/** What the scenarios describe: the core set, compiled as every season plays it. */
const SET = compileSet(CORE_DOCS);
const DOC_BY_KEY = new Map(CORE_DOCS.map((r) => [r.doc.slug, r]));

const TIER_LABEL: Record<Scenario["tier"], string> = {
  engine: "`pnpm test`",
  live: "live probe",
};
const DATA_LABEL = "publish · `pnpm test`";

/** The entry's English name; the doc is written in English. */
function displayName(key: string): string {
  if (key === "*") return "Rules that span the subsystem";
  return SET.byKey.get(key)?.names.en ?? key;
}

const UNIT_WORDS: Record<string, [string, string]> = {
  rolls: ["roll", "rolls"],
  moves: ["move", "moves"],
  passed_games: ["passed game", "passed games"],
  triggers: ["trigger", "triggers"],
};

function durationOf(entry: CompiledEffect): string {
  const { unit, count } = entry.duration;
  // Wave A: one that acts as it arrives, and one that lasts the next game.
  if (unit === "instant") return "instant";
  if (unit === "next_game") return "the next game";
  const words = UNIT_WORDS[unit];
  if (count === null || !words) return "permanent";
  return `${count} ${count === 1 ? words[0] : words[1]}`;
}

function kindOf(key: string): string {
  const entry = SET.byKey.get(key);
  if (!entry) return "";
  if (isItem(entry)) {
    const { activation, charges, filter, target, window } = entry.usage;
    // A cursed or passive item is never used: what it has is firings (spec §6.10).
    if (activation !== "active") {
      const firings = charges === null ? "while held" : `${charges} ${charges === 1 ? "firing" : "firings"}`;
      return `item · ${activation} · ${entry.rarity} · ${firings}`;
    }
    return `item · ${entry.rarity} · target: ${target}${filter ? ` (${filter})` : ""} · window: ${window}`;
  }
  if (entry.duration.unit === "instant") return `effect · ${entry.polarity} · ${entry.rarity} · instant`;
  const stacking = entry.stacking.maxStacks === null
    ? entry.stacking.mode
    : `${entry.stacking.mode} (up to ${entry.stacking.maxStacks})`;
  return `effect · ${entry.polarity} · ${entry.rarity} · ${durationOf(entry)} · stacking: ${stacking}`;
}

const cell = (text: string) => text.replace(/\|/g, "\\|");

/** A data scenario as a table row: the given, each step's "when", each step's "then". */
function dataRow(key: string, s: ScenarioDoc): string {
  const self = SET.byKey.get(key)!;
  const name = (e: ScenarioEntry) => (e === "self" ? self.names.en : (SET.byEntryId.get(e.entry)?.names.en ?? e.slug ?? e.entry));
  const text = scenarioText(s, { locale: "en", name, refusal: (code) => `\`${code}\`` });
  const numbered = (parts: string[]) => (parts.length === 1 ? parts[0]! : parts.map((p, i) => `${i + 1}. ${p}`).join("<br>"));
  const cells = [
    `\`${s.id ?? "—"}\``,
    s.title.en ?? s.title.ru,
    text.given || "—",
    numbered(text.steps.map((t) => t.when)),
    numbered(text.steps.map((t) => t.then)),
    DATA_LABEL,
  ].map(cell);
  return `| ${cells.join(" | ")} |`;
}

function tableRow(s: Scenario): string {
  const cells = [`\`${s.id}\``, s.title, s.given, s.when, s.then, TIER_LABEL[s.tier]].map(cell);
  return `| ${cells.join(" | ")} |`;
}

/** Catalog order: items, then effects, then the rules that span them. */
const order = [...SET.entries.filter(isItem), ...SET.entries.filter(isEffect)].map((e) => e.key);
const dataOf = (key: string): ScenarioDoc[] => DOC_BY_KEY.get(key)?.doc.scenarios ?? [];
const tableOf = (key: string): Scenario[] => SCENARIOS.filter((s) => s.entry === key);
const entries = [...order, "*"].filter((key) => dataOf(key).length + tableOf(key).length > 0);

const dataCount = order.reduce((n, key) => n + dataOf(key).length, 0);
const engineCount = SCENARIOS.filter((s) => s.tier === "engine").length;
const liveCount = SCENARIOS.filter((s) => s.tier === "live").length;

const lines: string[] = [];

lines.push("# Items & effects — scenario reference");
lines.push("");
lines.push("> **Generated file — do not edit.** `pnpm scenarios:doc` rebuilds it from the");
lines.push("> scenarios in the documents of the system pack `core`");
lines.push("> ([`seed/iee/core.ggpack`](../seed/iee/core.ggpack), via its generated fixture) and from the");
lines.push("> subsystem table [`lib/engine/iee/scenarios.ts`](../lib/engine/iee/scenarios.ts). An entry's");
lines.push("> scenarios are data (spec §5.5): publishing and importing run them and refuse a red one,");
lines.push("> and `lib/modules/iee/sim/core-scenarios.test.ts` runs core's. The table's scenarios cannot");
lines.push("> appear here without an implementation: `lib/modules/iee/scenarios.test.ts` and");
lines.push("> `probe/scenarios.mts` each fail if one of their tier is unimplemented.");
lines.push("");
lines.push(
  `${dataCount + SCENARIOS.length} scenarios across ${entries.length} entries — ` +
    `${dataCount} in the entries' documents, ${engineCount} more run by \`pnpm test\`, ` +
    `${liveCount} live (need the turn transaction, the database and a browser).`,
);
lines.push("");
lines.push("Every scenario is phrased as an observable consequence rather than a property of");
lines.push("the catalog. Two bugs reached a real playthrough because a test asserted that an");
lines.push("effect *declared* a hook and never that the hook *did* anything.");
lines.push("");
lines.push("Entry scenarios play in the scenario season (spec §5.5): a 40-cell board, one d6 on a");
lines.push("pass and two on a drop, points never ride on a roll, and the wheel hands nothing out.");
lines.push("The holder starts on cell 10 with 5 points, the rival on cell 12 with 5 points.");
lines.push("");

// contents
lines.push("## Contents");
lines.push("");
for (const key of entries) {
  const count = dataOf(key).length + tableOf(key).length;
  const anchor = displayName(key).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  lines.push(`- [${displayName(key)}](#${anchor}) — ${count}`);
}
lines.push("");

for (const key of entries) {
  const data = dataOf(key);
  const table = tableOf(key);
  lines.push(`## ${displayName(key)}`);
  lines.push("");
  const kind = kindOf(key);
  if (kind) {
    lines.push(`\`${key}\` — ${kind}`);
    lines.push("");
  }
  lines.push("| ID | Scenario | Given | When | Then | Checked by |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const s of data) lines.push(dataRow(key, s));
  for (const s of table) lines.push(tableRow(s));
  lines.push("");
  const notes = [
    ...data.filter((s) => s.note).map((s) => `- **${s.id ?? s.title.en}** — ${s.note!.en ?? s.note!.ru}`),
    ...table.filter((s) => s.note).map((s) => `- **${s.id}** — ${s.note}`),
  ];
  if (notes.length) {
    lines.push(...notes);
    lines.push("");
  }
}

lines.push("---");
lines.push("");
lines.push("## Running them");
lines.push("");
lines.push("```");
lines.push("pnpm test                 # core's entry scenarios, the subsystem table, and the coverage checks");
lines.push("```");
lines.push("");
lines.push("Publishing an entry or importing a pack runs its scenarios too, and refuses a red one.");
lines.push("The live half runs against a built app and a scratch database and lives in the");
lines.push("verification harness (`probe/scenarios.mts`), not in this repository's toolchain.");
lines.push("Its results are recorded in `WORKLOG.md` for each session.");
lines.push("");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`wrote ${OUT} — ${dataCount + SCENARIOS.length} scenarios, ${entries.length} entries`);
