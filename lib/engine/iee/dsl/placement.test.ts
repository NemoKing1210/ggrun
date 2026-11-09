import { describe, expect, it } from "vitest";

import {
  actionsAt,
  conditionsAt,
  hasTargetAt,
  isAimed,
  placesItself,
  recipientsAt,
  remembersTargetAt,
  scopeOf,
  seesTargetAt,
  sourcesAt,
  triggerShape,
  triggersFor,
} from "./placement";

describe("placement — what the constructor offers (spec §6.7)", () => {
  it("items have rules on use and pickup, effects on everything else", () => {
    // Wave D: an item that placed itself on the board acts when a move enters its cell.
    expect(triggersFor("item")).toEqual(["onUse", "onPickup", "onObjectEntered"]);
    expect(triggersFor("effect")).toEqual([
      "onApply",
      "onExpire",
      "beforeMovement",
      "afterDice",
      "afterMovement",
      "beforeCellEffect",
      "afterCellEffect",
      "onOutcome",
      "onTick",
      // Wave B: what arrives, and what holds while it lasts.
      "onIncoming",
      "whileActive",
      // Wave C: the pick of the holder's next game, and the game assigned.
      "beforeGameRoll",
      "onRollCreated",
      // Wave D: a rival's move ends on the holder's cell.
      "onSameCell",
    ]);
  });

  it("offers the conditions a trigger can check", () => {
    // Nothing is known about the turn when an item is used or an effect lands.
    const anywhere = ["chance", "hasEntry", "rank", "itemCount", "targetRelative"];
    expect(conditionsAt("onUse")).toEqual(anywhere);
    expect(conditionsAt("onApply")).toEqual(anywhere);
    expect(conditionsAt("afterMovement")).toEqual(["outcome", "chance", "hasEntry", "diceShow", "rank", "itemCount", "targetRelative", "compareLastRoll"]);
    expect(conditionsAt("beforeCellEffect")).toEqual([
      "outcome",
      "cellType",
      "chance",
      "hasEntry",
      "diceShow",
      "rank",
      "itemCount",
      "targetRelative",
      "compareLastRoll",
    ]);
    expect(conditionsAt("onOutcome")).toEqual(["outcome", "cellType", "chance", "hasEntry", "rank", "itemCount", "targetRelative"]);
  });

  it("offers what reads the chosen player only where one can be seen (wave A, spec §6.11)", () => {
    const aimed = { kind: "item" as const, aimed: true };
    const plain = { kind: "item" as const, aimed: false };
    const effect = { kind: "effect" as const, aimed: false };
    expect(conditionsAt("onUse", aimed)).toContain("targetRelative");
    expect(conditionsAt("onUse", plain)).not.toContain("targetRelative");
    // An effect remembers whom its item was aimed at, and reads them at the turn's hooks only.
    expect(conditionsAt("afterMovement", effect)).toEqual(expect.arrayContaining(["targetRelative", "compareLastRoll"]));
    expect(conditionsAt("onApply", effect)).not.toContain("targetRelative");
    // A held item remembers nobody.
    expect(conditionsAt("afterMovement", plain)).not.toContain("compareLastRoll");
    expect(remembersTargetAt(effect, "onTick")).toBe(true);
    expect(remembersTargetAt(effect, "onExpire")).toBe(false);
    expect(remembersTargetAt(plain, "afterDice")).toBe(false);
    expect(seesTargetAt(effect, "afterDice", false)).toBe(false);
    expect(seesTargetAt(aimed, "onUse", false)).toBe(true);
  });

  it("offers the sources a number may read where the moment knows them (wave A, spec §6.5)", () => {
    const effect = { kind: "effect" as const, aimed: false };
    expect(sourcesAt(effect, "afterDice")).toEqual(["diceSum", "itemCount", "targetLastRoll"]);
    // No dice before the throw, and none when an item is used.
    expect(sourcesAt(effect, "beforeMovement")).toEqual(["itemCount", "targetLastRoll"]);
    expect(sourcesAt({ kind: "item", aimed: true }, "onUse")).toEqual(["itemCount", "targetLastRoll"]);
    expect(sourcesAt({ kind: "item", aimed: false }, "onUse")).toEqual(["itemCount"]);
    expect(sourcesAt(effect, "onApply")).toEqual(["itemCount"]);
  });

  it("offers the actions a trigger can run", () => {
    expect(actionsAt("beforeMovement")).toEqual(["dice"]);
    expect(actionsAt("afterMovement")).toEqual(["steps", "noMove"]);
    expect(actionsAt("beforeCellEffect")).toEqual(["skipCellEffect"]);
    expect(actionsAt("afterCellEffect")).toEqual(["balance", "extraSpin"]);
    expect(actionsAt("onUse")).toEqual([
      "balance",
      "grantEffect",
      "grantItem",
      "cleanse",
      "move",
      "moveToTarget",
      "swapPositions",
      "rollbackLastMove",
      "halveGap",
      "remove",
      "stealItem",
      "transferItem",
      "swapItems",
      "copyItem",
      "grantChosen",
      // Unscoped: what the trigger runs anywhere — the game in flight at an open roll's use only (wave C).
      "rerollGame",
      "postponeGame",
      // Wave D: the item stands on the cell its use picked.
      "placeObject",
    ]);
    // What an object does to the move that enters its cell (wave D, §6.18).
    expect(actionsAt("onObjectEntered")).toEqual(["stopMove", "push", "extend", "spinInstead"]);
    expect(actionsAt("onTick")).toEqual(["balance", "grantEffect", "grantItem", "cleanse", "remove", "transferItem", "victimChoice"]);
    expect(actionsAt("onOutcome")).toEqual([
      "balance",
      "grantEffect",
      "grantItem",
      "cleanse",
      "remove",
      "transferItem",
      "extraSpin",
      "victimChoice",
    ]);
  });

  it("puts a choice to the holder where an entry runs by itself, never at a use; a hold limit stands while it lasts (wave B, spec §6.14)", () => {
    expect(actionsAt("onUse")).not.toContain("victimChoice");
    expect(actionsAt("onPickup", { kind: "item", aimed: false })).toContain("victimChoice");
    expect(actionsAt("whileActive", { kind: "effect", aimed: false })).toContain("holdLimit");
    expect(actionsAt("onApply", { kind: "effect", aimed: false })).not.toContain("holdLimit");
  });

  it("offers a jump to a player only where a player is chosen (wave A)", () => {
    expect(actionsAt("onUse", { kind: "item", aimed: true })).toContain("moveToTarget");
    expect(actionsAt("onUse", { kind: "item", aimed: false })).not.toContain("moveToTarget");
    expect(actionsAt("onApply", { kind: "effect", aimed: false })).toEqual([
      "balance",
      "grantEffect",
      "grantItem",
      "cleanse",
      "move",
      "swapPositions",
      "rollbackLastMove",
      "halveGap",
      "remove",
      "transferItem",
      "victimChoice",
    ]);
  });

  it("takes, trades and copies items only where a player is chosen (wave B, spec §6.12)", () => {
    const aimed = actionsAt("onUse", { kind: "item", aimed: true });
    const own = actionsAt("onUse", { kind: "item", aimed: false });
    for (const op of ["stealItem", "swapItems", "copyItem"] as const) {
      expect(aimed).toContain(op);
      expect(own).not.toContain(op);
    }
    // A gift goes to a random rival anywhere, to the chosen player only where there is one.
    expect(own).toContain("transferItem");
    expect(own).toContain("grantChosen");
    expect(actionsAt("onApply", { kind: "effect", aimed: false })).not.toContain("grantChosen");
    expect(actionsAt("afterMovement")).not.toContain("extraSpin");
  });

  it("an instant effect's rules run on arrival only (wave A)", () => {
    expect(triggersFor("effect", { instant: true })).toEqual(["onApply"]);
    expect(triggersFor("item", { instant: true })).toEqual(triggersFor("item"));
  });

  it("a passive or cursed item works at the turn hooks while held, and is never used (wave A)", () => {
    // Wave B adds what arrives and what holds while it is held — never an active item's.
    const held = ["onPickup", "beforeMovement", "afterDice", "afterMovement", "beforeCellEffect", "afterCellEffect", "onOutcome", "onTick", "onIncoming", "whileActive", "beforeGameRoll", "onRollCreated", "onSameCell"];
    expect(triggersFor("item", { activation: "passive" })).toEqual(held);
    expect(triggersFor("item", { activation: "cursed" })).toEqual(held);
    // Only a used item stands on the board (wave D): a held one has no cell.
    expect(triggersFor("item", { activation: "active" })).toEqual(["onUse", "onPickup", "onObjectEntered"]);
    expect(held).not.toContain("onObjectEntered");
    expect(triggerShape({ kind: "item", usage: { activation: "cursed" } })).toEqual({ activation: "cursed", places: false });
    expect(triggerShape({ kind: "item" })).toEqual({ activation: "active", places: false });
    expect(triggerShape({ kind: "effect", duration: { unit: "instant" } })).toEqual({ instant: true });
    // Never used, so never aimed — whatever its document says.
    expect(scopeOf({ kind: "item", usage: { activation: "cursed", target: { who: "other" } } }).aimed).toBe(false);
    expect(conditionsAt("onPickup", { kind: "item", aimed: false })).toEqual(["chance", "hasEntry", "rank", "itemCount"]);
  });

  it("offers nothing at a trigger it does not know", () => {
    expect(conditionsAt("onTeleport")).toEqual([]);
    expect(actionsAt("onTeleport")).toEqual([]);
  });

  it("offers the next game's rules where a game is picked, a picked game's favour in an effect only (wave C)", () => {
    const effect = { kind: "effect" as const, aimed: false };
    const held = { kind: "item" as const, aimed: false };
    // Nothing about a turn is known yet, and nobody is chosen: the holder's own state and a chance.
    expect(conditionsAt("beforeGameRoll", effect)).toEqual(["chance", "hasEntry", "rank", "itemCount"]);
    expect(actionsAt("beforeGameRoll", effect)).toEqual(["poolExclude", "poolRequire", "poolFavor", "chooseOfN"]);
    // A held item remembers no pick (§6.16).
    expect(actionsAt("beforeGameRoll", held)).toEqual(["poolExclude", "poolRequire", "chooseOfN"]);
    // The pool's actions stand nowhere else.
    for (const when of ["onUse", "onApply", "afterMovement", "onOutcome", "whileActive"]) {
      expect(actionsAt(when, effect)).not.toContain("poolExclude");
    }
  });

  it("offers what acts on the game in flight at the use of an item used on an open roll only (wave C, spec §6.16)", () => {
    const open = scopeOf({ kind: "item", usage: { activation: "active", window: "on_open_roll", target: { who: "other" } } });
    expect(open).toEqual({ kind: "item", aimed: true, reaction: false, openRoll: true, places: false });
    expect(actionsAt("onUse", open)).toEqual(expect.arrayContaining(["rerollGame", "postponeGame"]));
    for (const usage of [{ activation: "active" as const }, { activation: "active" as const, window: "before_roll" as const }]) {
      const elsewhere = actionsAt("onUse", scopeOf({ kind: "item", usage }));
      expect(elsewhere).not.toContain("rerollGame");
      expect(elsewhere).not.toContain("postponeGame");
    }
    // Never held: a passive item is never used on an open roll.
    expect(scopeOf({ kind: "item", usage: { activation: "passive", window: "on_open_roll" } }).openRoll).toBe(false);
    expect(actionsAt("onApply", scopeOf({ kind: "effect" }))).not.toContain("rerollGame");
  });

  it("offers the dice pipeline right after the dice (wave A)", () => {
    expect(actionsAt("afterDice")).toEqual(["rerollOn", "bestOfTwo", "worstOfTwo", "resultModify", "direction"]);
    expect(conditionsAt("afterDice")).toEqual(["outcome", "chance", "hasEntry", "diceShow", "rank", "itemCount", "targetRelative", "compareLastRoll"]);
    // What the dice showed is known from the throw on, not before it.
    expect(conditionsAt("afterMovement")).toContain("diceShow");
    expect(conditionsAt("beforeMovement")).not.toContain("diceShow");
    expect(conditionsAt("onOutcome")).not.toContain("diceShow");
  });

  it("a chosen player exists only when an aimed item is used", () => {
    expect(isAimed({ target: { who: "other" } })).toBe(true);
    expect(isAimed({ target: { who: "any" } })).toBe(true);
    expect(isAimed({ target: { who: "self" } })).toBe(false);
    expect(isAimed(undefined)).toBe(false);

    const aimed = scopeOf({ kind: "item", usage: { target: { who: "other" } } });
    expect(aimed).toEqual({ kind: "item", aimed: true, reaction: false, openRoll: false, places: false });
    expect(hasTargetAt(aimed, "onUse")).toBe(true);
    expect(recipientsAt(aimed, "onUse")).toEqual(["self", "target"]);

    // An effect never aims, whatever its document says about usage.
    const effect = scopeOf({ kind: "effect", usage: { target: { who: "other" } } });
    expect(effect.aimed).toBe(false);
    expect(hasTargetAt(effect, "onUse")).toBe(false);
    expect(recipientsAt(scopeOf({ kind: "item", usage: { target: { who: "self" } } }), "onUse")).toEqual(["self"]);
  });
});

describe("placement — reaction items (wave B, spec §6.15)", () => {
  const reaction = scopeOf({ kind: "item", usage: { activation: "active", window: "after_dice", target: { who: "other" } } });

  it("is a reaction, aimed at nobody", () => {
    expect(reaction).toEqual({ kind: "item", aimed: false, reaction: true, openRoll: false, places: false });
    expect(hasTargetAt(reaction, "onUse")).toBe(false);
  });

  it("its use is read after the dice, and runs what acts on the throw — and nothing else does", () => {
    expect(new Set(actionsAt("onUse", reaction))).toEqual(new Set(["reroll", "rerollOn", "bestOfTwo", "resultModify"]));
    expect(conditionsAt("onUse", reaction)).toContain("diceShow");
    expect(conditionsAt("onUse", scopeOf({ kind: "item" }))).not.toContain("diceShow");
    expect(actionsAt("afterDice", scopeOf({ kind: "effect" }))).not.toContain("reroll");
    expect(actionsAt("onUse", scopeOf({ kind: "item" }))).not.toContain("reroll");
  });
});

describe("placement — an item that stands on the board (wave D, spec §6.18)", () => {
  const placing = { kind: "item" as const, usage: { activation: "active" as const, target: { who: "self" as const }, pick: "cell" as const } };

  it("only an active item whose use asks for a cell places itself", () => {
    expect(placesItself(placing)).toBe(true);
    expect(placesItself({ kind: "item", usage: { activation: "active", pick: "genre" } })).toBe(false);
    expect(placesItself({ kind: "item", usage: { activation: "passive", pick: "cell" } })).toBe(false);
    expect(placesItself({ kind: "effect" })).toBe(false);
    expect(scopeOf(placing).places).toBe(true);
    expect(triggerShape(placing)).toEqual({ activation: "active", places: true });
  });

  it("offers the moment a move enters its cell, and the placing, to it alone", () => {
    expect(triggersFor("item", triggerShape(placing))).toEqual(["onUse", "onPickup", "onObjectEntered"]);
    expect(triggersFor("item", { activation: "active", places: false })).toEqual(["onUse", "onPickup"]);
    expect(actionsAt("onUse", scopeOf(placing))).toContain("placeObject");
    expect(actionsAt("onUse", scopeOf({ kind: "item" }))).not.toContain("placeObject");
    // The unscoped list is everything the trigger may run.
    expect(actionsAt("onUse")).toContain("placeObject");
  });

  it("what an object checks is the mover's: never a chosen player", () => {
    const at = conditionsAt("onObjectEntered", scopeOf(placing));
    expect(at).toEqual(["outcome", "chance", "hasEntry", "diceShow", "rank", "itemCount"]);
    expect(at).not.toContain("targetRelative");
  });
});

describe("placement — the same cell (wave D, spec §6.19)", () => {
  it("is a moment of an effect and of a held item, never of an active one", () => {
    expect(triggersFor("effect")).toContain("onSameCell");
    expect(triggersFor("item", { activation: "passive" })).toContain("onSameCell");
    expect(triggersFor("item", { activation: "cursed" })).toContain("onSameCell");
    expect(triggersFor("item", { activation: "active" })).not.toContain("onSameCell");
  });

  it("only an item is taken; both may pay out, hand out and take away there", () => {
    const held = scopeOf({ kind: "item", usage: { activation: "passive" } });
    const effect = scopeOf({ kind: "effect" });
    expect(actionsAt("onSameCell", held)).toEqual(["balance", "grantEffect", "grantItem", "cleanse", "remove", "transferItem", "takeEntry"]);
    expect(actionsAt("onSameCell", effect)).toEqual(["balance", "grantEffect", "grantItem", "cleanse", "remove", "transferItem"]);
    // Nothing of a turn is known: the holder's own conditions only.
    expect(conditionsAt("onSameCell", held)).toEqual(["chance", "hasEntry", "rank", "itemCount"]);
  });
});

