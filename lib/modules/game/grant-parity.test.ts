import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * There is one way to hand a player a status, and everyone uses it.
 *
 * Three things can grant one — a wheel drop from a bonus or penalty cell, an
 * item being used, and a challenge reward — and each used to insert its own
 * row. Only the wheel read the season's tuning, so the wizard screen described
 * one third of the game: heavy boots tuned to "-4 for 3 rolls" arrived as the
 * catalog's "-2 for 1" whenever they came from lead weights or a challenge.
 *
 * The other two copies had also quietly lost the stacking policy. A `unique`
 * status granted by an item was inserted a second time and *both rows fired* —
 * two `unlucky` statuses shrinking the dice twice — and a `refresh` status
 * granted by a challenge reward stacked instead of refreshing.
 *
 * Like `turn-parity.test.ts`, this states the rule rather than the symptom: no
 * caller may write an effect or an item row directly. It reads source rather
 * than behaviour, which is a deliberate trade — behaviour is the live probe's
 * job; this is what stops the three copies growing back.
 */

const CALLERS = {
  "service/iee.ts": "the wheel — a bonus or penalty cell",
  "service/use-item.ts": "an item being used",
  "service/events.ts": "a challenge reward",
} as const;

/** Writing a grant by hand. Exactly what must happen in one place only. */
const RAW_WRITES = ["insertEffect", "grantItem", "refreshEffect"];

function sourceFile(full: string): ts.SourceFile {
  return ts.createSourceFile(
    full,
    fs.readFileSync(full, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

const gameFile = (rel: string) => sourceFile(path.join(process.cwd(), "lib", "modules", "game", rel));

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

describe("a grant has exactly one implementation", () => {
  const callers = Object.keys(CALLERS) as Array<keyof typeof CALLERS>;

  it.each(callers)("%s grants through the shared path", (rel) => {
    const called = calledNames(gameFile(rel));
    expect(
      [...called].some((n) => n === "grantEffect" || n === "grantInventoryItem"),
      CALLERS[rel],
    ).toBe(true);
  });

  it.each(callers)("%s writes no row of its own", (rel) => {
    const called = calledNames(gameFile(rel));
    const raw = RAW_WRITES.filter((name) => called.has(name));
    expect(
      raw,
      `${CALLERS[rel]} must go through grantEffect / grantInventoryItem — ` +
        "a second copy is how the season's tuning stopped applying to two thirds of grants",
    ).toEqual([]);
  });

  it("and the shared path does the writing (a scan of nothing proves nothing)", () => {
    const called = calledNames(gameFile("service/grant.ts"));
    for (const name of RAW_WRITES) {
      expect(called, `grant.ts must call ${name}`).toContain(name);
    }
    expect(called, "and it must read the season's tuning").toContain("resolveEffectGrant");
  });
});

/**
 * A refresh restarts a timer. It may never shorten one.
 *
 * Writing the new expiry flat meant "set the timer to whatever the newest grant
 * says", which — paired with the catalog-versus-season gap above — turned an
 * attack into a favour: a season that stretched `slowed` to five rolls handed
 * out five from a penalty cell, and an enemy's hex scroll carrying the
 * catalog's two overwrote five with two.
 *
 * The rule is one `greatest()` in SQL, so there is nothing pure to unit-test
 * here. Asserting the source is weaker than asserting behaviour and is the
 * honest limit of a test that has no database; the live probe covers the rest.
 */
describe("refreshEffect never reduces what is already there", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "modules", "iee", "repository", "effects.ts"),
    "utf8",
  );
  const body = src.slice(
    src.indexOf("export async function refreshEffect"),
    src.indexOf("export async function getActiveEffectRows"),
  );

  it("finds the function at all", () => {
    expect(body.length).toBeGreaterThan(200);
  });

  it.each(["expiresAfterRollSeq", "chargesLeft"])("takes the better of the two %s", (field) => {
    const line = body
      .split("\n")
      .findIndex((l) => l.includes(`${field}:`));
    expect(line, `${field} must be assigned in the refresh`).toBeGreaterThan(-1);
    const window = body.split("\n").slice(line, line + 4).join("\n");
    expect(window, `${field} must be raised, never overwritten`).toContain("greatest(");
  });
});
