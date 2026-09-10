import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The player an effect is told about is the player it is attached to.
 *
 * `runHook` hands every effect an `IeePlayerSnapshot` describing its holder.
 * `loadTurnHooks` used to build that snapshot by hand with two fields filled
 * in from nowhere: `moveCount: sp.rollSeq` and `rank: 1`.
 *
 * Neither is a rounding error. `moveCount` is `count(moves)` everywhere else in
 * the codebase — `counters.ts` carries a comment explaining exactly why it must
 * not be the roll counter, since `roll_seq` backfills to zero on a season that
 * was already in flight — and rank is a real query, the one catch-up weighting
 * is built on.
 *
 * No catalog entry reads either field today. That is the only reason nothing
 * was broken, and precisely why it needed fixing before something did: a
 * rank-aware effect would have seen every player in first place and no test
 * would have said a word.
 */
const FILE = path.join(process.cwd(), "lib", "modules", "game", "service", "iee.ts");

/** Comments explain the old shape; only the code counts. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("loadTurnHooks — the hook context describes the real player", () => {
  const src = fs.readFileSync(FILE, "utf8");
  const body = stripComments(src.slice(src.indexOf("export async function loadTurnHooks")));

  it("finds the function (a scan of nothing proves nothing)", () => {
    expect(body.length).toBeGreaterThan(400);
  });

  it("builds the snapshot from the database, not by hand", () => {
    expect(body, "use toPlayerSnapshot — rank and moveCount are queries").toContain(
      "toPlayerSnapshot(sp)",
    );
  });

  it.each([
    ["rank: 1", "rank is a real position among the participants"],
    ["moveCount: sp.rollSeq", "moveCount is count(moves), never the roll counter"],
  ])("never hardcodes `%s`", (literal, why) => {
    expect(body, why).not.toContain(literal);
  });
});
