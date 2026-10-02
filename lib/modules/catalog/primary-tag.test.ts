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

describe("every game drawn carries the primary tag", () => {
  const fn = functionNode("lib/modules/catalog/repository/pool.ts", "pickGameForRoll");
  const body = fn?.body?.getText() ?? "";

  it("finds the picker and its catalog queries (a scan of nothing proves nothing)", () => {
    expect(body.length).toBeGreaterThan(500);
    expect(catalogWheres(fn!).length).toBeGreaterThanOrEqual(3);
  });

  it("matches it as a genre or as a tag", () => {
    expect(body).toMatch(/gamesCatalog\.genres\} && \$\{textArray\(split\.primary\)\} OR \$\{gamesCatalog\.tags\} && \$\{textArray\(split\.primary\)\}/);
    expect(body).toMatch(/if \(primaryCond\) extraSql\.push\(primaryCond/);
  });

  /**
   * The last resort ignores the season's filters — and must not ignore the
   * primary tag with them, or a Horror season that ran out of horror games
   * would quietly start handing out anything.
   */
  it("in every query, the last resort included", () => {
    const offenders = catalogWheres(fn!).filter((w) => !/whereClause|drawScope|primaryCond/.test(w));
    expect(offenders).toEqual([]);
    const lastResort = catalogWheres(fn!).find((w) => /isBlacklisted/.test(w) && !/whereClause/.test(w));
    expect(lastResort, "the last-resort query").toBeDefined();
    expect(lastResort).toMatch(/primaryCond/);
  });

  it("ranks by the season's other genres and tags instead of requiring them", () => {
    expect(body).toMatch(/splitPoolFilters\(filters, \{ cellLocked \}\)/);
    expect(body).toMatch(/INTERSECT SELECT unnest\(\$\{textArray\(split\.soft\)\}\)\)\) DESC/);
    expect(body, "the old hard filters on the raw lists").not.toMatch(/textArray\(filters\.(genres|tags)\)/);
  });
});
