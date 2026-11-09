import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine/config";
import { parseSeasonSettingsForm } from "@/lib/modules/season/actions/seasons/form";

import { hardProviderFilters } from "./pool/primary-filters";

/**
 * The primary tag end to end: what the form sends, what the providers are
 * asked for, and what the draw requires. The draw itself needs a database, so
 * its rules are read off the syntax tree here and were checked against a real
 * one (see WORKLOG).
 */

const REPO = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

describe("hardProviderFilters", () => {
  const base = { ...DEFAULT_SEASON_CONFIG.gamePool.filters, genres: ["action", "adventure"], tags: ["horror", "survival"] };

  it("asks the provider for the primary tag alone, in the list it belongs to", () => {
    expect(hardProviderFilters({ ...base, primaryTag: "horror" })).toMatchObject({ genres: [], tags: ["horror"] });
    expect(hardProviderFilters({ ...base, primaryTag: "indie" })).toMatchObject({ genres: ["indie"], tags: [] });
    expect(hardProviderFilters({ ...base, primaryTag: "roguelike" })).toMatchObject({ genres: [], tags: ["roguelike", "roguelite"] });
  });

  it("keeps everything else in the filter", () => {
    const out = hardProviderFilters({ ...base, primaryTag: "horror", platforms: ["pc"], metacriticMin: 70 });
    expect(out.platforms).toEqual(["pc"]);
    expect(out.metacriticMin).toBe(70);
  });

  it("passes a season without a primary tag through unchanged", () => {
    const f = { ...base, primaryTag: null };
    expect(hardProviderFilters(f)).toBe(f);
  });

  it.each(["lib/modules/catalog/providers/rawg.ts", "lib/modules/catalog/providers/gamespot.ts"])(
    "%s builds its request from it",
    (rel) => {
      expect(read(rel)).toMatch(/hardProviderFilters\(/);
    },
  );
});

describe("the season form carries the primary tag", () => {
  const form = (entries: Record<string, string>) => {
    const fd = new FormData();
    fd.set("structured", "1");
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    return parseSeasonSettingsForm(fd).config as { gamePool: { filters: { primaryTag?: string | null } } };
  };

  it("reads it, and reads an empty field as a deliberate none", () => {
    expect(form({ filters_primaryTag: "horror" }).gamePool.filters.primaryTag).toBe("horror");
    // null, not absent: absent would let the schema put the template's back
    expect(form({ filters_primaryTag: "" }).gamePool.filters.primaryTag).toBeNull();
    // and the schema keeps it so for a season set up from a template
    const saved = SeasonConfigSchema.parse(form({ filters_primaryTag: "", gamePool_templateId: "horror" }));
    expect(saved.gamePool.templateId).toBe("horror");
    expect(saved.gamePool.filters.primaryTag).toBeNull();
  });

  it("is always sent by the editor", () => {
    expect(read("components/admin/SeasonSettingsForm.tsx")).toMatch(
      /formData\.set\("filters_primaryTag", cfg\.gamePool\.filters\.primaryTag \?\? ""\)/,
    );
  });
});

function functionNode(rel: string, name: string): ts.FunctionDeclaration | null {
  const full = path.join(REPO, rel);
  const sf = ts.createSourceFile(full, read(rel), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  let out: ts.FunctionDeclaration | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) out = node;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** `.from(x).where(y)` pairs inside a function: the table and the condition text. */
function catalogWheres(fn: ts.Node): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "where" &&
      /\.from\(gamesCatalog\)/.test(node.expression.expression.getText())
    ) {
      out.push(node.arguments.map((a) => a.getText()).join(", "));
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return out;
}

/** The arguments of every call to `name` inside a function, as text. */
function callArguments(fn: ts.Node, name: string): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
      out.push(node.arguments.map((a) => a.getText()).join(", "));
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return out;
}

describe("every game drawn carries the primary tag", () => {
  const POOL = "lib/modules/catalog/repository/pool.ts";
  const fn = functionNode(POOL, "pickGameForRoll");
  const body = fn?.body?.getText() ?? "";
  // The season's pool is built in one place; the picker and the pick's offers draw from it.
  const scopeFn = functionNode(POOL, "poolScope");
  const scope = scopeFn?.body?.getText() ?? "";

  it("finds the picker, its pool and its catalog queries (a scan of nothing proves nothing)", () => {
    expect(body.length).toBeGreaterThan(500);
    expect(scope.length).toBeGreaterThan(500);
    expect(catalogWheres(fn!).length).toBeGreaterThanOrEqual(3);
  });

  it("matches it as a genre or as a tag", () => {
    expect(scope).toMatch(/gamesCatalog\.genres\} && \$\{textArray\(split\.primary\)\} OR \$\{gamesCatalog\.tags\} && \$\{textArray\(split\.primary\)\}/);
    expect(scope).toMatch(/if \(primaryCond\) conditions\.push\(primaryCond\)/);
    expect(scope).toMatch(/const whereClause = and\(\.\.\.conditions\)/);
  });

  /**
   * The last resort ignores the season's filters — and must not ignore the
   * primary tag with them, or a Horror season that ran out of horror games
   * would quietly start handing out anything. Every other query draws from the
   * season's pool: the draw takes a scope, and is only ever handed the pool's.
   */
  it("in every query, the last resort included", () => {
    const offenders = catalogWheres(fn!).filter((w) => !/\bscope\b|whereClause|drawScope|primaryCond/.test(w));
    expect(offenders).toEqual([]);
    expect(callArguments(fn!, "drawShaped").sort()).toEqual(["drawScope", "whereClause"]);
    for (const arg of callArguments(fn!, "draw")) expect(arg).toMatch(/^(scope|and\(scope, \.\.\.rules\)!?)$/);
    const lastResort = catalogWheres(fn!).find((w) => /isBlacklisted/.test(w) && !/whereClause/.test(w));
    expect(lastResort, "the last-resort query").toBeDefined();
    expect(lastResort).toMatch(/primaryCond/);
  });

  it("what a use may pick for the next game comes from the same pool", () => {
    for (const name of ["pickGames", "offeredPick"]) {
      const picker = functionNode(POOL, name);
      expect(catalogWheres(picker!).length, name).toBeGreaterThan(0);
      for (const where of catalogWheres(picker!)) expect(where, name).toMatch(/drawScope/);
    }
    expect(functionNode(POOL, "pickOffers")?.body?.getText() ?? "").toMatch(/WHERE \$\{drawScope\}[\s\S]*WHERE \$\{drawScope\}/);
  });

  it("ranks by the season's other genres and tags instead of requiring them", () => {
    expect(scope).toMatch(/splitPoolFilters\(filters, \{ cellLocked \}\)/);
    expect(scope).toMatch(/INTERSECT SELECT unnest\(\$\{textArray\(split\.soft\)\}\)\)\) DESC/);
    expect(scope, "the old hard filters on the raw lists").not.toMatch(/textArray\(filters\.(genres|tags)\)/);
  });
});
