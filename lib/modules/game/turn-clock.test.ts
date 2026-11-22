import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * One clock per turn.
 *
 * Several places in `applyResolvedTurn` ask "which roll is this": the hook
 * dispatch (which statuses take part — `participates()` against each
 * instance's anchor), the `turnBase` every hook reads, the wheel (a drop is
 * anchored at the roll being resolved, so it starts with the next one) and the
 * settlement at the end (which counters go down). They must be one number.
 *
 * Under the old tables they were not: the filters used `sp.rollSeq`, the roll
 * that had already finished, while the expiry sweep used `sp.rollSeq + 1`, the
 * one being resolved — so every `rolls` duration lasted a roll longer than the
 * catalog declared: `heavy_boots` (1) shortened two moves, `slowed` (2) three.
 *
 * The engine suite cannot see this. Each half is a correct pure function; only
 * the wiring can be wrong, and the wiring lives in a service that needs a
 * request and a database. It was found by driving a real browser against a
 * real turn — and this test exists so it cannot come back quietly.
 *
 * It reads source rather than behaviour on purpose: it cannot prove the turn
 * is right, only that the clocks are still one clock.
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

/** Text of property `prop` of the object literal passed as the nth argument of every call to `name`. */
function propOfArg(sf: ts.SourceFile, name: string, index: number, prop: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name &&
      node.arguments.length > index
    ) {
      const arg = node.arguments[index]!;
      if (ts.isObjectLiteralExpression(arg)) {
        for (const p of arg.properties) {
          if (ts.isPropertyAssignment(p) && p.name.getText() === prop) found.push(p.initializer.getText());
          if (ts.isShorthandPropertyAssignment(p) && p.name.getText() === prop) found.push(prop);
        }
      }
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
  const wheel = propOfArg(sf, "applyWheels", 1, "turnRollSeq");
  const settle = propOfArg(sf, "settleTurnHooks", 2, "turnRollSeq");
  const base = turnBaseRollSeq(sf);
  const clocks = () => [...hookFilter, ...wheel, ...settle, base!];

  it("finds every call site (a scan of nothing proves nothing)", () => {
    expect(hookFilter, "loadTurnHooks(sp, enabled, turnRollSeq, registry)").toHaveLength(1);
    expect(wheel, "applyWheels(exec, { turnRollSeq, … })").toHaveLength(1);
    expect(settle, "settleTurnHooks(exec, hooks, { turnRollSeq, … })").toHaveLength(1);
    expect(base, "turnBase = { rollSeq: … }").not.toBeNull();
  });

  it("passes the same expression to every one of them", () => {
    expect(
      new Set(clocks()),
      `these must all be the same variable, got ${JSON.stringify(clocks())}`,
    ).toHaveProperty("size", 1);
  });

  // The distinguishing detail: it must be the roll being resolved, not the one
  // that already finished. `sp.rollSeq` is the latter.
  it("uses the roll being resolved, never the player's current counter", () => {
    for (const c of clocks()) {
      expect(c, "the turn's clock must not be sp.rollSeq").not.toMatch(/\bsp\.rollSeq\b/);
    }
  });
});
