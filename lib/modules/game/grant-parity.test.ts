import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Items and effects have one writer, and everyone goes through it
 * (docs/IEE_CONSTRUCTOR_SPEC.md §9).
 *
 * Three things can hand a player something — a wheel drop, an item being used,
 * a challenge reward — and each used to insert its own row. Only the wheel read
 * the season's tuning, so heavy boots tuned to "-4 for 3 rolls" arrived as the
 * catalog's "-2 for 1" whenever they came from lead weights or a challenge; and
 * the copies had quietly lost the stacking policy, so a `unique` status could
 * land twice and fire twice.
 *
 * The executor ended that: every grant, use, tick, end and reset is one of its
 * operations, journaled with its cause. That nothing else *writes* the IEE
 * tables is an architecture rule (`lib/architecture.test.ts`); this test pins
 * the other half — **each caller reaches them through the executor**. It reads
 * source rather than behaviour, which is a deliberate trade: behaviour is the
 * executor suite's and the live probe's job; this is what stops the copies
 * growing back.
 */

const ROOT = process.cwd();

function parse(full: string): ts.SourceFile {
  return ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
}

function calledNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const fn = node.expression;
      if (ts.isIdentifier(fn)) out.add(fn.text);
      else if (ts.isPropertyAccessExpression(fn)) out.add(fn.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Who hands things out or takes them back, and the executor operation each must use. */
const CALLERS: Record<string, { why: string; uses: string[] }> = {
  // The turn's IEE half moved out of `game/service/iee.ts` so the simulations
  // settle turns with the same code; the rule is unchanged, only its address.
  "lib/modules/iee/turn/index.ts": {
    why: "the wheel and a turn's statuses",
    uses: ["grant", "fire", "runIntents", "tick"],
  },
  // The item path decides and carries out through `lib/modules/iee/use`, which
  // the simulations share; the executor calls moved there with it.
  "lib/modules/game/service/use-item.ts": { why: "an item being used", uses: ["decideItemUse", "carryOutItemUse"] },
  "lib/modules/iee/use/index.ts": { why: "an item being used", uses: ["useCharge", "runIntents"] },
  "lib/modules/game/service/events.ts": { why: "a challenge reward", uses: ["grant"] },
  "lib/modules/iee/service/intervene.ts": { why: "a judge's revoke", uses: ["endInstance"] },
  "lib/modules/season/service/seasons.ts": { why: "a season reset", uses: ["resetIeeState"] },
};

describe("every caller goes through the executor", () => {
  it.each(Object.keys(CALLERS))("%s", (file) => {
    const called = calledNames(parse(path.join(ROOT, file)));
    const { why, uses } = CALLERS[file]!;
    for (const op of uses) expect(called, `${why} must call ${op}`).toContain(op);
  });
});

/**
 * A refresh restarts a timer. It may never shorten one (fix A3): an enemy's
 * two-roll `slowed` must not cut a five-roll one short, and a renewal counts
 * like a fresh copy — the roll underway stays with the old count (§7.10). The
 * arithmetic is the pure `refreshCounter` and the counting roll `countingFrom`
 * (tested in `lib/engine/iee/resolve/live.test.ts`); this only pins that the
 * executor's refresh, ticks and firings use them rather than a copy.
 */
describe("a refresh never shortens what is already there", () => {
  it("the executor's grant computes it with refreshCounter, and counts with countingFrom", () => {
    const called = calledNames(parse(path.join(ROOT, "lib/modules/iee/executor/index.ts")));
    expect(called).toContain("refreshCounter");
    expect(called).toContain("countingFrom");
  });
});
