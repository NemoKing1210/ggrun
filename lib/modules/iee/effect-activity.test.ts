import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * "Is this status still doing something" has one answer.
 *
 * Under the old tables it had four: expiry was lazy, `state = 'active'` did
 * not mean "in force", and every surface had to re-derive the truth from the
 * counters — the dashboard read the wrong one, the board and leaderboards did
 * not check at all, and spent shields stayed on screen.
 *
 * Counters are eager now (docs/IEE_CONSTRUCTOR_SPEC.md §7.9): the executor
 * ends an instance in the transaction that spends its last unit, so an active
 * row *is* a status in force and nothing needs to compare counters to know it.
 * One narrower question is left — does an instance take part in *this* roll,
 * or was it granted while that roll was in flight (SC-HEXSCROLL-7) — and it is
 * answered once, by `participates()`:
 *
 *   - `lib/engine/iee/resolve/live.ts` — the only comparison of an anchor.
 *
 * A second copy is a status that touches a move it must not.
 */

const SANCTIONED = ["lib/engine/iee/resolve/live.ts"];

/** The anchor exists for exactly this rule, which makes it the field to scan for. */
const FIELD = /\banchorRollSeq\b/;

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

/** Files containing a comparison whose operands mention the anchor. */
function filesComparingTheAnchor(): string[] {
  const COMPARISONS = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
  ]);
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
    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && COMPARISONS.has(node.operatorToken.kind)) {
        // `participates` compares its parameter; a copy would name the field.
        if (FIELD.test(node.getText())) found = true;
      }
      // The SQL form: gt(ieeInstances.anchorRollSeq, …)
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

describe("the participation rule is not re-implemented", () => {
  const hits = filesComparingTheAnchor();

  it("finds it where it belongs (a scan of nothing proves nothing)", () => {
    for (const file of SANCTIONED) {
      expect(hits, `${file} must carry the rule`).toContain(file);
    }
  });

  it("finds it nowhere else", () => {
    expect(
      hits.filter((f) => !SANCTIONED.includes(f)),
      "call participates() instead of comparing the anchor again",
    ).toEqual([]);
  });
});

/**
 * The badge surfaces ask the instances repository and take what it gives them.
 *
 * Filtering in a page is the arrangement that produced the drift in the first
 * place: five pages, five chances to get it wrong, and no one place to fix it.
 */
const BADGE_PAGES = [
  "app/(public)/board/page.tsx",
  "app/(public)/leaderboard/page.tsx",
  "app/(public)/seasons/[slug]/board/page.tsx",
  "app/(public)/seasons/[slug]/leaderboard/page.tsx",
  "app/(public)/dashboard/page.tsx",
];

describe("status badges come from the repository, already filtered", () => {
  it.each(BADGE_PAGES)("%s reads statuses through the instances repository", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).toMatch(/\b(effectBadgesBySeason|listActiveEffects)\b/);
  });

  it.each(BADGE_PAGES)("%s neither filters them again nor reads the retired tables", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src, "an active instance is in force — nothing to re-check").not.toMatch(
      /\b(participates|isEffectActive|stillInForce)\b/,
    );
    expect(src, "the pre-constructor status queries and their expiry field are gone").not.toMatch(
      /\b(getActiveEffectsBySeason|getActiveEffectsWithCaster|getHeldItems|expiresAfterRollSeq)\b/,
    );
  });
});
