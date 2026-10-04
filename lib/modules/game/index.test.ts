import { describe, expect, it } from "vitest";

import * as game from "./index";
import * as moderation from "./moderation";
import * as completion from "./moderation/completion";
import * as reroll from "./moderation/reroll";
import * as events from "./service/events";
import * as helpers from "./service/helpers";
import * as iee from "./service/iee";
import * as resolve from "./service/resolve";
import * as roll from "./service/roll";
import * as turn from "./service/turn";
import * as useItem from "./service/use-item";

/**
 * The barrel is the module's public surface. A dropped `export *` is silent:
 * every call site that imported from the barrel stops compiling, but anything
 * that reached the file directly keeps working, so the loss shows up as a
 * confusing build error far from the cause. These compare identity, not
 * existence — `toBeDefined` would pass for an accidental re-export of an
 * unrelated symbol.
 */
describe("lib/modules/game barrel", () => {
  it.each([
    ["rollNewGame", roll.rollNewGame],
    ["resolveGameRoll", resolve.resolveGameRoll],
    ["applyResolvedTurn", turn.applyResolvedTurn],
    ["activateInventoryItem", useItem.activateInventoryItem],
    ["polarityForCell", iee.polarityForCell],
    ["assignEventFromCell", events.assignEventFromCell],
    ["parseSeasonConfig", helpers.parseSeasonConfig],
  ] as const)("re-exports %s from its service module", (name, impl) => {
    expect(game[name as keyof typeof game]).toBe(impl);
  });

  it("carries the moderation verdicts through the same barrel", () => {
    expect(game.approveRerollRequest).toBe(reroll.approveRerollRequest);
    expect(game.rejectRerollRequest).toBe(reroll.rejectRerollRequest);
    expect(game.approveCompletionRequest).toBe(completion.approveCompletionRequest);
    expect(game.rejectCompletionRequest).toBe(completion.rejectCompletionRequest);
  });

  it("moderation barrel keeps its two halves", () => {
    expect(moderation.approveRerollRequest).toBe(reroll.approveRerollRequest);
    expect(moderation.rejectRerollRequest).toBe(reroll.rejectRerollRequest);
    expect(moderation.approveCompletionRequest).toBe(completion.approveCompletionRequest);
    expect(moderation.rejectCompletionRequest).toBe(completion.rejectCompletionRequest);
  });
});
