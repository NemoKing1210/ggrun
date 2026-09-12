import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { errors as enErrors } from "@/lib/i18n/dictionaries/en/core";
import { errors as ruErrors } from "@/lib/i18n/dictionaries/ru/core";
import { errors as ukErrors } from "@/lib/i18n/dictionaries/uk/core";
// From the engine, not the repository: importing the repository would pull in
// the database client and its environment validation, and this rule needs
// neither.
import { POOL_EMPTY_ERROR, type PoolEmptyReason } from "@/lib/engine";

/**
 * Running out of games is a real state, and it says which one it is.
 *
 * A player rolled several games, finished them, rolled again and was told "no
 * games available in the catalog — add games or check your filters". The
 * catalog was fine. They had simply been handed every game in it, which is one
 * of four quite different situations that all used to arrive as a bare `null`
 * and be reported with that one sentence:
 *
 *   - the catalog really is empty → add games;
 *   - this participant has had them all → add games, or accept the season is over
 *     for them;
 *   - unplayed games exist but the pool filters exclude every one → widen the
 *     filters (this is also what per-cell genre locking does when it lands
 *     someone on a genre they have exhausted);
 *   - an API-sourced season whose provider returned nothing → check the key.
 *
 * Worse, the answer depended on a setting nobody can see. With a catalog-sourced
 * season the same exhaustion did not error at all: the code fell through to "any
 * non-blacklisted game", handing back something already played, in silence —
 * while the README promises that already-played games never come up.
 */

describe("every empty-pool reason can be told to the player", () => {
  const REASONS: PoolEmptyReason[] = [
    "catalog_empty",
    "all_played",
    "filters_exclude_all",
    "provider_empty",
  ];

  it.each(REASONS)("%s maps to an error code", (reason) => {
    expect(POOL_EMPTY_ERROR[reason]).toBeTruthy();
  });

  it("gives each reason a code of its own", () => {
    const codes = REASONS.map((r) => POOL_EMPTY_ERROR[r]);
    expect(new Set(codes).size, "two reasons sharing a message is one reason").toBe(codes.length);
  });

  // A code with no dictionary entry reaches the player as the raw identifier.
  it.each(REASONS)("%s has text in en, ru and uk", (reason) => {
    const code = POOL_EMPTY_ERROR[reason] as keyof typeof enErrors;
    for (const [lang, dict] of [
      ["en", enErrors],
      ["ru", ruErrors],
      ["uk", ukErrors],
    ] as const) {
      expect(dict[code], `${code} is missing from ${lang}`).toBeTruthy();
    }
  });

  it("does not tell someone who has played everything to check their filters", () => {
    expect(POOL_EMPTY_ERROR.all_played).not.toBe(POOL_EMPTY_ERROR.filters_exclude_all);
    expect(POOL_EMPTY_ERROR.all_played).not.toBe(POOL_EMPTY_ERROR.catalog_empty);
  });
});

const REPO = process.cwd();

function functionNode(rel: string, name: string): ts.FunctionDeclaration | null {
  const full = path.join(REPO, rel);
  const sf = ts.createSourceFile(
    full,
    fs.readFileSync(full, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  let out: ts.FunctionDeclaration | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) {
      out = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The text of every `.where(…)` argument inside a function, layout-independent. */
function whereClauses(fn: ts.Node): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "where"
    ) {
      out.push(node.arguments.map((a) => a.getText()).join(", "));
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return out;
}

describe("a game already played is never handed out again", () => {
  const fn = functionNode("lib/modules/catalog/repository/pool.ts", "pickGameForRoll");
  const body = fn?.body?.getText() ?? "";

  it("finds the picker (a scan of nothing proves nothing)", () => {
    expect(body.length).toBeGreaterThan(500);
    expect(whereClauses(fn!).length, "and its queries").toBeGreaterThan(1);
  });

  it("excludes played games from the main query", () => {
    expect(body).toMatch(/notInArray\(gamesCatalog\.id, playedIds\)/);
  });

  /**
   * The removed fallback was a query whose only condition was "not
   * blacklisted". Any query inside the picker that filters on `isBlacklisted`
   * without also naming `playedIds` can hand back a game the participant has
   * already had — which is the whole defect. Read off the syntax tree rather
   * than the text, so putting the query back on one line does not hide it.
   */
  it("and from every fallback query too", () => {
    const offenders = whereClauses(fn!).filter(
      (clause) => /isBlacklisted/.test(clause) && !/playedIds/.test(clause),
    );
    expect(
      offenders,
      "a catalog query filtered only by isBlacklisted can hand back a played game",
    ).toEqual([]);
  });
});

/**
 * A reroll that has nothing to reroll into used to insert a roll row with a
 * null game: the player was left holding an open roll naming no game, which
 * cannot be resolved, and their reroll allowance had been spent on it.
 */
describe("no roll is created without a game", () => {
  const CALLERS = [
    "lib/modules/game/service/roll.ts",
    "lib/modules/game/service/resolve.ts",
    "lib/modules/game/moderation/reroll.ts",
  ];

  it.each(CALLERS)("%s never inserts a null gameId", (rel) => {
    const text = fs.readFileSync(path.join(REPO, rel), "utf8");
    expect(text).not.toMatch(/gameId:\s*game\?\.id\s*\?\?\s*null/);
  });

  it.each(CALLERS)("%s refuses when the pool is empty", (rel) => {
    const text = fs.readFileSync(path.join(REPO, rel), "utf8");
    expect(text, "throw the reason the picker gave").toMatch(/POOL_EMPTY_ERROR\[/);
  });
});
