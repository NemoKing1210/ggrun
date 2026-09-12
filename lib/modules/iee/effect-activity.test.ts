import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * "Is this status still doing something" has one answer, in two forms.
 *
 * `player_effects.state = 'active'` does not mean a status is in force. Expiry
 * is lazy — this project has no scheduler, by design — so a row keeps that
 * state until the player's *next* resolve sweeps it. Anything that wants to
 * know whether a status is live must also read `charges_left` and
 * `expires_after_roll_seq`, and must compare the latter against the roll that
 * is next, never the one that just finished.
 *
 * That rule was written four times. The engine had it right; the dashboard
 * carried a copy that read the wrong counter, so a status spent a moment
 * earlier lingered on screen showing "0 rolls left"; and the board and
 * leaderboard queries did not check it at all, so a used-up shield stayed
 * visible until its owner moved again — and forever, for a player who had
 * stopped playing. Those badges are what PvP is played on.
 *
 * Two forms are legitimate, because one runs in TypeScript over rows already
 * loaded and the other has to run in SQL over a whole season:
 *
 *   - `lib/engine/iee/resolve/hooks.ts` — `isEffectActive`, the turn's own rule;
 *   - `lib/modules/iee/repository/effects.ts` — `stillInForce()`, the same rule
 *     as a `where` clause.
 *
 * A third is a bug waiting to be found by a player.
 */

const SANCTIONED = [
  "lib/engine/iee/resolve/hooks.ts",
  "lib/modules/iee/repository/effects.ts",
];

/**
 * `expires_after_roll_seq` is the field to scan for: unlike `chargesLeft`, which
 * inventory rows also carry with an unrelated meaning, it exists for exactly
 * one purpose.
 */
const FIELD = /\bexpiresAfterRollSeq\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const ROOTS = ["app", "lib", "components"].map((d) => path.join(process.cwd(), d));
const FILES = ROOTS.flatMap((r) => walk(r));

/** Files containing a comparison whose operands mention the field. */
function filesComparingTheField(): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, "utf8");
    if (!FIELD.test(src)) continue;
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.ESNext,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    let found = false;
    const COMPARISONS = new Set<ts.SyntaxKind>([
      ts.SyntaxKind.LessThanToken,
      ts.SyntaxKind.LessThanEqualsToken,
      ts.SyntaxKind.GreaterThanToken,
      ts.SyntaxKind.GreaterThanEqualsToken,
    ]);
    const visit = (node: ts.Node) => {
      if (
        ts.isBinaryExpression(node) &&
        COMPARISONS.has(node.operatorToken.kind) &&
        FIELD.test(node.getText())
      ) {
        found = true;
      }
      // The SQL form: gte(playerEffects.expiresAfterRollSeq, …)
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["gt", "gte", "lt", "lte"].includes(node.expression.text) &&
        FIELD.test(node.getText())
      ) {
        found = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (found) hits.push(path.relative(process.cwd(), file).replaceAll("\\", "/"));
  }
  return hits.sort();
}

describe("the activity rule is not re-implemented", () => {
  const hits = filesComparingTheField();

  it("finds it where it belongs (a scan of nothing proves nothing)", () => {
    for (const file of SANCTIONED) {
      expect(hits, `${file} must carry the rule`).toContain(file);
    }
  });

  it("finds it nowhere else", () => {
    expect(
      hits.filter((f) => !SANCTIONED.includes(f)),
      "a fourth copy of this predicate is a spent status drawn as a live one",
    ).toEqual([]);
  });
});

/**
 * The badge surfaces ask the repository and take what it gives them.
 *
 * Filtering in the page would work, but it is the arrangement that produced the
 * drift in the first place: four pages, four chances to get it wrong, and no
 * one place to fix it.
 */
const BADGE_PAGES = [
  "app/(public)/board/page.tsx",
  "app/(public)/leaderboard/page.tsx",
  "app/(public)/seasons/[slug]/board/page.tsx",
  "app/(public)/seasons/[slug]/leaderboard/page.tsx",
  "app/(public)/dashboard/page.tsx",
];

describe("status badges come from the repository, already filtered", () => {
  it.each(BADGE_PAGES)("%s reads statuses through the repository", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).toMatch(/getActiveEffects(BySeason|WithCaster)/);
  });

  it.each(BADGE_PAGES)("%s does not filter them again itself", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src, "the repository already applied the rule").not.toMatch(/\bisEffectActive\b/);
  });
});
