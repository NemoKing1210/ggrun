import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { EntryDescription } from "@/components/iee/EntryDescription";

/**
 * Two halves, because the defect had two halves.
 *
 * The render tests pin the sizes down. The source scan is the one that
 * matters over time: the original problem was not that one `<p>` was 11px, it
 * was that the same `<p>` had been written six times and every copy was free
 * to drift. Pinning the component while leaving the call sites free would
 * defend nothing.
 */

describe("EntryDescription — what it renders", () => {
  it("sets prose at `base` — it is the content, not an annotation", () => {
    const html = renderToStaticMarkup(<EntryDescription>Slows another player.</EntryDescription>);
    expect(html).toContain("text-base");
    expect(html).toContain("Slows another player.");
  });

  it("sets dense list prose at `sm`", () => {
    const html = renderToStaticMarkup(<EntryDescription tone="dense">Rare drop.</EntryDescription>);
    expect(html).toContain("text-sm");
  });

  // The description must never be set smaller than the name above it, which is
  // the inversion that started this: `text-sm` uppercase name over 11px prose.
  it.each(["default", "dense"] as const)("%s tone is at least `sm`", (tone) => {
    const html = renderToStaticMarkup(<EntryDescription tone={tone}>x</EntryDescription>);
    expect(html).toMatch(/\btext-(sm|base|lg)\b/);
  });

  // DESIGN.md §2 has no 11px step; those sizes are HUD mono labels.
  it.each(["default", "dense"] as const)("%s tone never falls below the type scale", (tone) => {
    const html = renderToStaticMarkup(<EntryDescription tone={tone}>x</EntryDescription>);
    expect(html).not.toContain("text-[11px]");
    expect(html).not.toContain("text-[10px]");
  });

  it("renders nothing rather than an empty box when there is no description", () => {
    // `{def ? dictText(...) : ""}` is the real shape at two call sites.
    expect(renderToStaticMarkup(<EntryDescription>{""}</EntryDescription>)).toBe("");
    expect(renderToStaticMarkup(<EntryDescription>{null}</EntryDescription>)).toBe("");
    expect(renderToStaticMarkup(<EntryDescription>{undefined}</EntryDescription>)).toBe("");
  });

  it("keeps a caller's layout classes", () => {
    const html = renderToStaticMarkup(
      <EntryDescription tone="dense" className="line-clamp-2 max-w-md">x</EntryDescription>,
    );
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("max-w-md");
  });
});

/** Every .tsx under components/, walked once. */
function componentFiles(dir = path.join(process.cwd(), "components")): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return componentFiles(full);
    return e.isFile() && full.endsWith(".tsx") && !full.endsWith(".test.tsx") ? [full] : [];
  });
}

/**
 * Sub-`xs` type is legal in this design system, but only for HUD chrome:
 * mono counters, stamped display headers, small buttons, and uppercase
 * tracking-widest labels. It is never legal for a sentence.
 *
 * Stating it that way — rather than "these six files must not contain 11px" —
 * is what makes it a rule instead of a snapshot, and it is what found the two
 * strays this test caught on its first run: a moderator's rejection reason on
 * the challenges panel, and a simulator caption in the season wizard.
 */
const CHROME = [
  /\bfont-mono\b/,
  /\bammo-counter\b/,
  /\bfont-display\b/,
  /\bhud-btn\b/,
  /\buppercase\b[\s\S]*\btracking-/,
];
const SUB_XS = /\btext-\[(?:9|10|11)px\]/;

/** className string literals in a file, with their line numbers. */
function classNames(file: string): Array<{ value: string; line: number }> {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const out: Array<{ value: string; line: number }> = [];
  const push = (node: ts.Node, value: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    out.push({ value, line: line + 1 });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === "className" && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) push(node, init.text);
      // Template literals and ternaries: take the whole text, so a chrome
      // marker anywhere in the expression still counts as present.
      else if (ts.isJsxExpression(init) && init.expression) push(node, init.expression.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("type scale — sub-xs sizes are HUD chrome, never prose", () => {
  const offenders = componentFiles().flatMap((f) =>
    classNames(f)
      .filter((c) => SUB_XS.test(c.value) && !CHROME.some((r) => r.test(c.value)))
      .map((c) => `${path.relative(process.cwd(), f)}:${c.line}  ${c.value.slice(0, 70)}`),
  );

  it("finds sub-xs classes at all (a scan that matches nothing proves nothing)", () => {
    const all = componentFiles().flatMap((f) => classNames(f).filter((c) => SUB_XS.test(c.value)));
    expect(all.length).toBeGreaterThan(50);
  });

  it("leaves none of them on a bare element", () => {
    expect(
      offenders,
      "sub-xs type without a mono / display / button / stamped-label marker is prose set too small",
    ).toEqual([]);
  });
});
