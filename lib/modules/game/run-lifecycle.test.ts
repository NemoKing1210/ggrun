import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A run that has ended has ended, and reaching the end ends it.
 *
 * Two halves of one gap. `player_status` existed in four values and meant
 * nothing on the write path: a participant marked `finished`, `eliminated` or
 * `withdrawn` kept rolling, moving, drawing from the wheel and being targeted,
 * because no path ever read it. And nothing ever set it either — the `finish`
 * cell was a no-op, so a player who reached the last cell parked there and went
 * on rolling, and the season's winner was whoever the leaderboard query
 * happened to put first when a human looked.
 *
 * Both are source guards, and that is a deliberate trade: they cannot prove a
 * player finishes correctly — the live probe does that — only that no write
 * path has quietly stopped asking.
 */

const REPO = process.cwd();

function sourceOf(rel: string): { text: string; sf: ts.SourceFile } {
  const full = path.join(REPO, rel);
  const text = fs.readFileSync(full, "utf8");
  return {
    text,
    sf: ts.createSourceFile(full, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS),
  };
}

/**
 * Every path that advances a participant's run. Each must refuse one that is
 * no longer active — including the two approval paths, which for a long while
 * did not even check whether the *season* was still running.
 */
const WRITE_PATHS = [
  "lib/modules/game/service/roll.ts",
  "lib/modules/game/service/resolve.ts",
  "lib/modules/game/moderation/completion.ts",
  "lib/modules/game/moderation/reroll.ts",
];

describe("no write path moves a participant who is out of the run", () => {
  it.each(WRITE_PATHS)("%s checks the participant's status", (rel) => {
    const { text } = sourceOf(rel);
    expect(text, "refuse a non-active participant").toMatch(
      // The window is generous because two of these log before they throw.
      /sp\.status !== "active"[\s\S]{0,300}gamePlayerNotActive/,
    );
  });

  it.each(WRITE_PATHS)("%s checks the season's status", (rel) => {
    const { text } = sourceOf(rel);
    expect(text, "a closed season accepts no moves").toMatch(
      /season\.status !== "active"[\s\S]{0,300}gameSeasonNotActive/,
    );
  });
});

describe("reaching the finish cell finishes the run", () => {
  const { text, sf } = sourceOf("lib/modules/game/service/turn.ts");

  it("decides it from the position the player ends on", () => {
    // Not `landedType`: the landing cell's own effect can teleport them again,
    // and a teleport onto the last cell finishes them just as much.
    expect(text).toMatch(/cells\.find\(\(c\) => c\.position === finalPosition\)\?\.cellType === "finish"/);
  });

  it("only finishes someone who was still running", () => {
    expect(text).toMatch(/sp\.status === "active" &&/);
  });

  /**
   * The finish, the timestamp and the move are one statement. A finish
   * recorded without its move — or a move that forgot to record the finish —
   * would each leave the season with a winner nobody can explain.
   */
  it("writes the status, the time and the move together", () => {
    let together = false;
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const names = node.properties
          .map((p) => p.name?.getText())
          .filter((n): n is string => Boolean(n));
        if (names.includes("rollSeq") && names.includes("position")) {
          // The finish fields ride in on a spread, so look at the text.
          if (/finishedAt/.test(node.getText()) && /"finished"/.test(node.getText())) {
            together = true;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(together, "status + finishedAt must be set in the same UPDATE as the move").toBe(true);
  });

  it("announces it in the feed", () => {
    expect(text).toContain('eventType: "player_finished"');
  });
});

/**
 * The leaderboard's own comment said "finished players first" while the clause
 * sorted by `asc(status)` — which is the *enum's declaration order*,
 * `active, finished, eliminated, withdrawn`. Active players therefore outranked
 * finishers, and the champion card showed whoever was furthest along rather
 * than whoever had won. It only ever looked right because nothing set anyone to
 * `finished`.
 */
describe("the leaderboard puts finishers first, by arrival", () => {
  const { text } = sourceOf("lib/modules/season/repository/players.ts");
  const order = text.slice(text.indexOf("getLeaderboard"), text.indexOf("getSeasonPlayerForUser"));

  it("no longer sorts by the raw status enum", () => {
    expect(order).not.toMatch(/asc\(seasonPlayers\.status\)/);
  });

  it("ranks finished, then active, then everyone else", () => {
    expect(order).toMatch(/when 'finished' then 0 when 'active' then 1 else 2 end/);
  });

  it("separates finishers by when they arrived", () => {
    expect(order).toMatch(/finishedAt[\s\S]{0,40}asc nulls last/);
  });
});
