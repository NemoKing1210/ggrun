import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * There is one turn, and both ways of reaching it go through it.
 *
 * A resolved roll can arrive two ways: the player marks the outcome, or — when
 * `moderation.completionRequireApproval` is on — the player files a request and
 * a judge approves it. Those were two separate implementations of the same
 * thing. The second predated items and effects and never learned about them, so
 * turning the moderation switch on silently produced a different game: no wheel
 * spun, no status fired, no shield absorbed, no challenge was assigned, no
 * charge was spent, nothing expired, and `season_players.roll_seq` never
 * advanced — which made every item-granted status permanent, because that
 * column is the clock their duration is measured against.
 *
 * Nothing in the codebase said so. The admin console still showed the pool, the
 * drop table still printed percentages, and `/rules` still promised players the
 * whole list.
 *
 * So this test states the rule rather than the symptom: **neither entry point
 * may carry a turn of its own.** Both must delegate, and neither may reach for
 * the movement or IEE primitives directly. It reads source rather than
 * behaviour, which is a deliberate trade — it cannot prove the turn is correct,
 * only that there is exactly one of it. Correctness is the live probe's job.
 */

const ENTRY_POINTS = {
  "service/resolve.ts": "resolveGameRoll — the player marks the outcome",
  "moderation/completion.ts": "approveCompletionRequest — a judge approves it",
} as const;

/**
 * The turn's arithmetic — dice, move, landing cell — is the engine's
 * `playTurn`, and only `playTurn` calls these. The game's turn and the
 * simulations (entry scenarios, the sandbox) both play through it.
 */
const ARITHMETIC = ["resolveMovement", "applyMovementModifiers", "applyCellEffect"];

/** What the game's turn does around the arithmetic: load, write, settle. */
const TURN_CALLS = [
  "playTurn",
  "loadTurnHooks",
  "settleTurnHooks",
  // The landing's wheel and each one more a rule asks for (spec §6.12) — `applyWheel` in turn.
  "applyWheels",
  "loadWheelContext",
  "executionContext",
  "assignEventFromCell",
  "nextRollStatus",
];

/**
 * Calls that constitute *being* a turn. A file that makes one of these is
 * resolving a roll itself, which is precisely what must not happen twice.
 */
const TURN_PRIMITIVES = [...ARITHMETIC, ...TURN_CALLS, "applyWheel"];

function sourceFile(rel: string, root: string[] = ["lib", "modules", "game"]): ts.SourceFile {
  const full = path.join(process.cwd(), ...root, rel);
  return ts.createSourceFile(
    full,
    fs.readFileSync(full, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

/** Every called identifier in a file, by name. */
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

/** Property names assigned in any object literal — how `rollSeq:` is written. */
function assignedProperties(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) out.add(node.name.getText());
    if (ts.isShorthandPropertyAssignment(node)) out.add(node.name.getText());
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("a resolved turn has exactly one implementation", () => {
  const files = Object.keys(ENTRY_POINTS) as Array<keyof typeof ENTRY_POINTS>;

  it.each(files)("%s delegates to applyResolvedTurn", (rel) => {
    expect(calledNames(sourceFile(rel)), ENTRY_POINTS[rel]).toContain("applyResolvedTurn");
  });

  it.each(files)("%s does not resolve a turn itself", (rel) => {
    const called = calledNames(sourceFile(rel));
    const own = TURN_PRIMITIVES.filter((name) => called.has(name));
    expect(
      own,
      `${ENTRY_POINTS[rel]} must delegate the turn, not re-implement it — ` +
        "that divergence is what disabled every item and effect under approval mode",
    ).toEqual([]);
  });

  // The distinguishing symptom, and the one that outlived the others: the
  // approval path moved the player but never advanced the roll counter, so
  // durations measured in rolls never elapsed.
  it.each(files)("%s does not write rollSeq of its own", (rel) => {
    expect(assignedProperties(sourceFile(rel)), "only the turn advances the clock").not.toContain(
      "rollSeq",
    );
  });

  it("and the turn itself does all of it (a scan of nothing proves nothing)", () => {
    const called = calledNames(sourceFile("service/turn.ts"));
    for (const name of TURN_CALLS) {
      expect(called, `applyResolvedTurn must call ${name}`).toContain(name);
    }
    expect(assignedProperties(sourceFile("service/turn.ts"))).toContain("rollSeq");
  });

  it("with the engine's arithmetic, not a copy of it", () => {
    const own = ARITHMETIC.filter((name) => calledNames(sourceFile("service/turn.ts")).has(name));
    expect(own, "the dice, the move and the cell are playTurn's").toEqual([]);
    const engine = calledNames(sourceFile("turn/index.ts", ["lib", "engine"]));
    for (const name of ARITHMETIC) expect(engine, `playTurn must call ${name}`).toContain(name);
  });
});

/**
 * A season that hides its drops hides them at both ends.
 *
 * `revealDropsInFeed: false` suppressed the "you were handed X" line and
 * nothing else, so the feed still announced each status when it expired, and
 * still announced a shield absorbing a landing. The secret was kept for exactly
 * as long as it was interesting. Both lines are now gated by the same flag.
 *
 * (Item *use* stays public whatever the flag says — that is a separate,
 * deliberate rule: the public record is the deterrent against griefing.)
 */
describe("the feed respects revealDropsInFeed at both ends", () => {
  const sf = sourceFile("service/turn.ts");

  /** Text of the nth argument of every call to `name`. */
  function argsOf(name: string, index: number): string[] {
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

  it("passes the flag to the settlement that announces expiries", () => {
    const args = argsOf("settleTurnHooks", 2);
    expect(args, "settleTurnHooks(exec, hooks, { …, reveal })").toHaveLength(1);
    expect(args[0]).toMatch(/reveal:\s*config\.iee\.revealDropsInFeed/);
  });

  it("gates the shield's absorb line on it too", () => {
    let guarded = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isIfStatement(node) &&
        node.expression.getText().includes("cellAbsorbed") &&
        node.expression.getText().includes("revealDropsInFeed")
      ) {
        guarded = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(guarded, "`effect_cleansed` must be behind the same flag").toBe(true);
  });
});

/**
 * Entry scenarios and the sandbox (spec §5.5, §10.5) play turns in a memory
 * season. They are worth something only while their turn is the game's turn:
 * the same arithmetic, the same settlement, the same wheel, the same item
 * path — never a copy that could drift from it.
 */
describe("the simulations play the game's turn", () => {
  const sim = sourceFile("sim/season.ts", ["lib", "modules", "iee"]);
  const called = calledNames(sim);

  it.each(["playTurn", "settleTurnHooks", "applyWheels", "hooksOver", "decideItemUse", "carryOutItemUse"])(
    "calls %s",
    (name) => {
      expect(called, `the memory season must play through ${name}`).toContain(name);
    },
  );

  it("and none of the arithmetic itself", () => {
    expect(ARITHMETIC.filter((name) => called.has(name))).toEqual([]);
  });
});
