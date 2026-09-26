import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Why does Reroll on the dashboard reroll the move's dice, not the game?"
 *
 * It never did — the server moves nobody on a reroll; it swaps the game, or
 * files a request for a judge. But the reroll form shared `resolveAction`'s
 * action state with pass and drop, and `resolvePending` is what opens the dice
 * overlay: a reroll played the throw and then showed the *previous* move's dice
 * as its result. Pinned as source rules because the card needs a server action
 * to render; the behaviour was checked in a real browser (see WORKLOG).
 */
const text = fs.readFileSync(path.join(process.cwd(), "components/dashboard/RollCard.tsx"), "utf8");

describe("the dashboard reroll", () => {
  it("has an action state of its own", () => {
    expect(text).toMatch(/const \[rerollState, rerollFormAction, rerollPending\] = useActionState\(resolveAction/);
  });

  it("submits through it, not through the pass/drop state that throws the dice", () => {
    const modal = text.slice(text.indexOf('<Modal open={modal === "reroll"'));
    const form = modal.slice(0, modal.indexOf("</form>"));
    expect(form).toMatch(/<form action=\{rerollFormAction\}/);
    expect(form).not.toMatch(/resolveFormAction|resolvePending/);
  });

  it("never opens the dice overlay", () => {
    const opens = [...text.matchAll(/setDiceOverlayOpen\(true\)/g)].length;
    expect(opens, "one place opens the overlay").toBe(1);
    const effect = text.slice(text.indexOf("// dice inline result lifecycle"), text.indexOf("setDiceOverlayOpen(true)"));
    expect(effect).toMatch(/if \(resolvePending\)/);
    expect(effect).not.toMatch(/rerollPending/);
  });
});
