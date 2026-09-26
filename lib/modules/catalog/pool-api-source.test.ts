import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * An API-sourced season hands out only games its provider supplied.
 *
 * Reported as "I pick API in the season settings, it switches back to Internal
 * and the roll comes from the games already in the database". Two separate
 * defects produced that, and this file pins the one in the picker:
 *
 *   - after importing the provider's results, the draw ran over the whole
 *     shared catalog with the season's ordering. FreeToGame has no Metacritic
 *     score, the default ordering is "-metacritic", NULLS LAST — so every
 *     locally rated game outranked the provider's, and with twenty of them in
 *     the catalog an "API" season never handed out an API game at all;
 *   - `catalog.fallbackToCatalog`, on by default, turned any provider failure
 *     into a silent random local game, so a dead key looked like a working
 *     season.
 *
 * `pickGameForRoll` needs a database, so these read the syntax tree — the same
 * stated trade as the other guards in this folder: they cannot prove the draw
 * is right, only that the rule is still written down where it runs.
 */

const REPO = process.cwd();
const POOL = "lib/modules/catalog/repository/pool.ts";

function functionNode(rel: string, name: string): ts.FunctionDeclaration | null {
  const full = path.join(REPO, rel);
  const sf = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  let out: ts.FunctionDeclaration | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) out = node;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** `if (pool.source === "api") { …return… }` as a top-level statement. */
function isApiEarlyReturn(stmt: ts.Statement): boolean {
  if (!ts.isIfStatement(stmt)) return false;
  if (stmt.expression.getText().replace(/\s+/g, " ") !== 'pool.source === "api"') return false;
  let returns = false;
  const visit = (n: ts.Node) => {
    if (ts.isReturnStatement(n)) returns = true;
    ts.forEachChild(n, visit);
  };
  visit(stmt.thenStatement);
  return returns;
}

describe("an API season draws only from its provider", () => {
  const fn = functionNode(POOL, "pickGameForRoll");
  const body = fn?.body?.getText() ?? "";

  it("finds the picker (a scan of nothing proves nothing)", () => {
    expect(body.length).toBeGreaterThan(500);
  });

  it("scopes the draw to rows the season's provider supplied", () => {
    expect(body, "the post-import draw must filter on externalSource").toMatch(
      /eq\(gamesCatalog\.externalSource, pool\.provider\)/,
    );
  });

  it("reports a provider that could not be reached instead of handing out something else", () => {
    expect(body).toMatch(/"provider_unavailable"/);
  });

  /**
   * Everything after the provider block is catalog territory: the filtered
   * local candidates and the unfiltered last resort. An API season must have
   * returned before the first of them, whatever the provider did.
   */
  it("returns before any catalog fallback can run", () => {
    const stmts = [...(fn?.body?.statements ?? [])];
    const apiStop = stmts.findIndex(isApiEarlyReturn);
    const firstCatalogFallback = stmts.findIndex((s) => {
      const text = s.getText();
      return /anyFallback/.test(text) || /return \{ game: candidates\[/.test(text.replace(/\s+/g, " "));
    });
    expect(apiStop, "no top-level `if (pool.source === \"api\") return` found").toBeGreaterThanOrEqual(0);
    expect(firstCatalogFallback, "the catalog fallbacks were not found").toBeGreaterThan(0);
    expect(apiStop).toBeLessThan(firstCatalogFallback);
  });

  /**
   * FreeToGame returns its whole list (~400) sorted by popularity and the
   * provider used to keep `slice(0, pageSize)` of it — the same twenty games
   * on every roll. The sampling itself is tested in the engine
   * (`pool-sample.test.ts`); this pins that the provider uses it.
   */
  it("FreeToGame samples its list rather than keeping the head of it", () => {
    const text = fs.readFileSync(path.join(REPO, "lib/modules/catalog/providers/freetogame.ts"), "utf8");
    expect(text).toMatch(/return sampleUniform\(games, pageSize, Math\.random\)/);
    expect(text).not.toMatch(/games\.slice\(0, pageSize\)/);
  });

  /**
   * A season restricted by category rolled nothing: the provider asked
   * FreeToGame for one category and a `tag` parameter `/games` ignores, and
   * stored FreeToGame's own labels, which the season's filter (in our
   * vocabulary) never matched. The translation is tested in
   * `pool/freetogame-taxonomy.test.ts`; these pin that it is used.
   */
  it("FreeToGame asks by the season's categories and stores our vocabulary", () => {
    const text = fs.readFileSync(path.join(REPO, "lib/modules/catalog/providers/freetogame.ts"), "utf8");
    expect(text).toMatch(/planF2gQueries\(filters, Math\.random\)/);
    expect(text).toMatch(/f2gMainGenre\(g\.genre\)/);
    expect(text, "the /games endpoint ignores `tag`").not.toMatch(/params\.set\("category"/);
  });

  it("a known row learns the genres and tags a filtered request established", () => {
    const fn = functionNode(POOL, "importExternalGames");
    expect(fn?.body?.getText() ?? "").toMatch(/db\.update\(gamesCatalog\)\.set\(\{ genres, tags \}\)/);
  });

  it("no longer consults a fallback-to-catalog switch anywhere", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const text = fs.readFileSync(path.join(REPO, rel), "utf8");
          // The schema keeps a comment explaining the removal; code must not read it.
          if (/\.fallbackToCatalog\b|fallbackToCatalog:/.test(text)) offenders.push(rel);
        }
      }
    };
    for (const dir of ["lib", "components", "app"]) walk(dir);
    expect(offenders).toEqual([]);
  });
});
