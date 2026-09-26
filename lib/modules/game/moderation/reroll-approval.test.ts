import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * "Approving a reroll should allow it, not do it."
 *
 * `approveRerollRequest` used to draw the new game and swap it in at the
 * judge's click: the player found their game already replaced, never saw it
 * happen, and the draw used the pool as it was at approval time — a season
 * retuned since the request still handed out the old pool's games. Approval is
 * permission now; the player performs the reroll from the dashboard, and that
 * path (`resolveGameRoll`) accepts an approved request in place of a new one.
 *
 * Both functions need a database and a staff session, so these read the
 * syntax tree; the behaviour was checked in a real browser (see WORKLOG).
 */
const REPO = process.cwd();

function fnText(rel: string, name: string): string {
  const full = path.join(REPO, rel);
  const sf = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  let out = "";
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name && n.body) out = n.body.getText();
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("approving a reroll grants it", () => {
  const approve = fnText("lib/modules/game/moderation/reroll.ts", "approveRerollRequest");

  it("finds the function (a scan of nothing proves nothing)", () => {
    expect(approve.length).toBeGreaterThan(300);
  });

  it("draws no game and swaps nothing", () => {
    expect(approve).not.toMatch(/pickGameForRoll|rollRandomGame/);
    expect(approve).not.toMatch(/insert\(gameRolls\)/);
    expect(approve).not.toMatch(/status: "rerolled"/);
    expect(approve, "the reroll allowance is spent by the reroll, not the verdict").not.toMatch(/rerollsUsed: /);
  });

  it("marks the request approved and tells the feed", () => {
    expect(approve).toMatch(/status: "approved"/);
    expect(approve).toMatch(/eventType: "reroll_approved"/);
  });
});

describe("the player uses an approval from the dashboard", () => {
  const resolve = fnText("lib/modules/game/service/resolve.ts", "resolveGameRoll");

  it("looks for an approval before filing a new request", () => {
    const lookup = resolve.indexOf("getApprovedRerollForRoll(");
    const file = resolve.indexOf("createRerollRequest(");
    expect(lookup).toBeGreaterThan(-1);
    expect(file).toBeGreaterThan(lookup);
  });

  it("performs the reroll when approved, even in a season that requires approval", () => {
    expect(resolve).toMatch(/if \(approved \|\| !rerollRequireApproval\)/);
  });
});
