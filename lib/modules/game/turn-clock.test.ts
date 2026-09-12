import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * One clock per turn.
 *
 * A status carries `expiresAfterRollSeq`, and four places in `applyResolvedTurn`
 * compare a roll number against it: the activity filter in `loadTurnHooks`, the
 * second filter inside `runHook` (fed by `turnBase.rollSeq`), the `onTick`
 * context, and the expiry sweep. They were not the same number — the filters
 * used `sp.rollSeq`, the roll that had already finished, while the sweep used
 * `sp.rollSeq + 1`, the one being resolved. Two ends of one rule, one apart,
 * so every `rolls` duration lasted a roll longer than the catalog declared:
 * `heavy_boots` (1) shortened two moves, `slowed` (2) three.
 *
 * The engine suite cannot see this. Both halves are individually correct pure
 * functions; only the wiring is wrong, and the wiring lives in a service that
 * needs a request and a database. It was found by driving a real browser
 * against a real turn — and this test exists so it cannot come back quietly.
 *
 * It reads source rather than behaviour on purpose, and that is a deliberate
 * trade: it cannot prove the turn is right, only that the four clocks are still
 * one clock. The behaviour is proven by the live probe.
 */

// The turn moved out of `resolve.ts` when the judge's approval path stopped
// carrying a second copy of it; the rule below is unchanged, only its address.
const FILE = path.join(process.cwd(), "lib", "modules", "game", "service", "turn.ts");

function sourceFile() {
  return ts.createSourceFile(
    FILE,
    fs.readFileSync(FILE, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

/** Text of the nth argument of every call to `name`. */
function argsOf(sf: ts.SourceFile, name: string, index: number): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name &&
      node.arguments.length > index
    ) {
      found.push(node.arguments[index]!.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Text of `rollSeq:` inside the object literal assigned to `turnBase`. */
function turnBaseRollSeq(sf: ts.SourceFile): string | null {
  let out: string | null = null;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === "turnBase" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText() === "rollSeq") {
          out = prop.initializer.getText();
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("applyResolvedTurn — the turn has one roll counter", () => {
  const sf = sourceFile();
  const hookFilter = argsOf(sf, "loadTurnHooks", 2);
  const expirySweep = argsOf(sf, "expireEffectsFor", 2);
  const base = turnBaseRollSeq(sf);

  it("finds all three call sites (a scan of nothing proves nothing)", () => {
    expect(hookFilter, "loadTurnHooks(sp, enabled, turnRollSeq)").toHaveLength(1);
    expect(expirySweep, "expireEffectsFor(tx, spId, rollSeq)").toHaveLength(1);
    expect(base, "turnBase = { rollSeq: … }").not.toBeNull();
  });

  it("passes the same expression to every one of them", () => {
    const clocks = [...hookFilter, ...expirySweep, base!];
    expect(
      new Set(clocks),
      `these must all be the same variable, got ${JSON.stringify(clocks)}`,
    ).toHaveProperty("size", 1);
  });

  // The distinguishing detail: it must be the roll being resolved, not the one
  // that already finished. `sp.rollSeq` is the latter.
  it("uses the roll being resolved, never the player's current counter", () => {
    const clocks = [...hookFilter, ...expirySweep, base!];
    for (const c of clocks) {
      expect(c, "the turn's clock must not be sp.rollSeq").not.toMatch(/\bsp\.rollSeq\b/);
    }
  });
});
