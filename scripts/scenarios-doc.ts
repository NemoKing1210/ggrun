/**
 * Generates `ITEMS_EFFECTS_SCENARIOS.md` from `lib/engine/iee/scenarios.ts`.
 *
 * The reference is generated rather than written so it cannot describe
 * behaviour the code does not have. Editing the markdown by hand is pointless:
 * the next run overwrites it. Edit the table instead — and note that the two
 * suites fail until every scenario in it is implemented.
 *
 *   pnpm scenarios:doc
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { EFFECTS, ITEMS, SCENARIOS, type Scenario } from "@/lib/engine/iee";

const OUT = resolve(process.cwd(), "ITEMS_EFFECTS_SCENARIOS.md");

const TIER_LABEL: Record<Scenario["tier"], string> = {
  engine: "`pnpm test`",
  live: "live probe",
};

/** en dictionary keys are the display names; the doc is written in English. */
function displayName(key: string): string {
  if (key === "*") return "Rules that span the subsystem";
  const def = ITEMS[key] ?? EFFECTS[key];
  if (!def) return key;
  const leaf = def.i18n.name.split(".").slice(-2, -1)[0] ?? key;
  return leaf.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function kindOf(key: string): string {
  if (key === "*") return "";
  if (ITEMS[key]) {
    const item = ITEMS[key]!;
    return `item · ${item.rarity} · target: ${item.usage.target} · window: ${item.usage.window}`;
  }
  const effect = EFFECTS[key]!;
  const duration =
    effect.duration.kind === "rolls"
      ? `${effect.duration.value} roll${effect.duration.value === 1 ? "" : "s"}`
      : effect.duration.kind === "charges"
        ? `${effect.duration.value} charge${effect.duration.value === 1 ? "" : "s"}`
        : "permanent";
  return `effect · ${effect.polarity} · ${effect.rarity} · ${duration} · stacking: ${effect.stacking}`;
}

const order = [...Object.keys(ITEMS), ...Object.keys(EFFECTS), "*"];
const entries = order.filter((key) => SCENARIOS.some((s) => s.entry === key));

const lines: string[] = [];

lines.push("# Items & effects — scenario reference");
lines.push("");
lines.push("> **Generated file — do not edit.** `pnpm scenarios:doc` rebuilds it from");
lines.push("> [`lib/engine/iee/scenarios.ts`](./lib/engine/iee/scenarios.ts), which is also what");
lines.push("> the tests run. A scenario cannot appear here without an implementation:");
lines.push("> `lib/engine/iee-scenarios.test.ts` and `probe/scenarios.mts` each fail if one of");
lines.push("> their tier is unimplemented.");
lines.push("");
lines.push(
  `${SCENARIOS.length} scenarios across ${entries.length} entries — ` +
    `${SCENARIOS.filter((s) => s.tier === "engine").length} pure (run by \`pnpm test\`), ` +
    `${SCENARIOS.filter((s) => s.tier === "live").length} live (need the turn transaction, the ` +
    "database and a browser).",
);
lines.push("");
lines.push("Every scenario is phrased as an observable consequence rather than a property of");
lines.push("the catalog. Two bugs reached a real playthrough because a test asserted that an");
lines.push("effect *declared* a hook and never that the hook *did* anything.");
lines.push("");

// contents
lines.push("## Contents");
lines.push("");
for (const key of entries) {
  const count = SCENARIOS.filter((s) => s.entry === key).length;
  const anchor = displayName(key).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  lines.push(`- [${displayName(key)}](#${anchor}) — ${count}`);
}
lines.push("");

for (const key of entries) {
  const list = SCENARIOS.filter((s) => s.entry === key);
  lines.push(`## ${displayName(key)}`);
  lines.push("");
  const kind = kindOf(key);
  if (kind) {
    lines.push(`\`${key}\` — ${kind}`);
    lines.push("");
  }
  lines.push("| ID | Scenario | Given | When | Then | Checked by |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const s of list) {
    const cells = [
      `\`${s.id}\``,
      s.title,
      s.given,
      s.when,
      s.then,
      TIER_LABEL[s.tier],
    ].map((c) => c.replace(/\|/g, "\\|"));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push("");
  const notes = list.filter((s) => s.note);
  if (notes.length) {
    for (const s of notes) lines.push(`- **${s.id}** — ${s.note}`);
    lines.push("");
  }
}

lines.push("---");
lines.push("");
lines.push("## Running them");
lines.push("");
lines.push("```");
lines.push("pnpm test                 # the pure scenarios, plus the coverage checks");
lines.push("```");
lines.push("");
lines.push("The live half runs against a built app and a scratch database and lives in the");
lines.push("verification harness (`probe/scenarios.mts`), not in this repository's toolchain.");
lines.push("Its results are recorded in `WORKLOG.md` for each session.");
lines.push("");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`wrote ${OUT} — ${SCENARIOS.length} scenarios, ${entries.length} entries`);
