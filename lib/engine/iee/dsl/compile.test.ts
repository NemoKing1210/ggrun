import { describe, expect, it } from "vitest";

import { reduceHookPatches, type PatchSource } from "../resolve/hooks";
import { CompileError, compileEntry } from "./compile";
import type { EntryDoc } from "./doc";
import { FACTS, IDS, ctx, effectDoc, itemDoc, player, resolve, rngOf } from "./fixtures.test-helpers";
import { factsOf, isEffect, isItem, type CompiledEffect, type CompiledItem, type RuleContext } from "./runtime";

const REV = "99999999-9999-4999-8999-999999999999";

function effect(doc: EntryDoc): CompiledEffect {
  const out = compileEntry({ entryId: IDS.self, revisionId: REV, doc, resolve });
  if (!isEffect(out)) throw new Error("expected an effect");
  return out;
}

function item(doc: EntryDoc): CompiledItem {
  const out = compileEntry({ entryId: IDS.self, revisionId: REV, doc, resolve });
  if (!isItem(out)) throw new Error("expected an item");
  return out;
}

/** Runs one hook of one compiled effect the way the turn will, through the real reducer. */
function hook(e: CompiledEffect, name: "beforeMovement" | "afterMovement" | "beforeCellEffect" | "afterCellEffect" | "onOutcome" | "onTick", c: Partial<RuleContext> = {}) {
  const sources: PatchSource[] = [];
  for (const rule of e.hooks[name] ?? []) {
    const patch = rule.run(ctx({ trigger: name, params: e.defaults, ...c }));
    if (patch) sources.push({ id: "inst-1", effectKey: e.key, priority: rule.priority, appliedAt: 1, patch });
  }
  return reduceHookPatches(sources);
}

describe("compileEntry — common fields", () => {
  it("carries identity, names in every locale, generated text and the doc itself", () => {
    const e = effect(effectDoc({ name: { ru: "Тест", en: "Test" }, flavor: { ru: "Вкус" }, glyph: "BoltIcon" }));
    expect(e).toMatchObject({
      entryId: IDS.self,
      revisionId: REV,
      key: "test_effect",
      slug: "test_effect",
      kind: "effect",
      names: { ru: "Тест", en: "Test", uk: "Тест" },
      flavor: { ru: "Вкус", en: "Вкус", uk: "Вкус" },
      character: "penalty",
      polarity: "negative",
      rarity: "common",
      tags: ["movement"],
      glyph: "BoltIcon",
    });
    expect(e.ruleText.en).toBe("Your move is 1 cell shorter. Lasts 2 rolls.");
    expect(e.doc.slug).toBe("test_effect");
  });

  it("drops a glyph the icon set does not have, so the kind's glyph shows", () => {
    expect(effect(effectDoc({ glyph: "UnknownIcon" })).glyph).toBeNull();
    expect(effect(effectDoc()).flavor).toBeNull();
  });

  it("starts instances from the declared defaults", () => {
    const e = effect(
      effectDoc({
        params: { steps: { type: "int", default: -2, min: -6, max: -1 } },
        rules: [{ when: "afterMovement", do: [{ op: "steps", delta: { param: "steps" } }] }],
      }),
    );
    expect(e.defaults).toEqual({ steps: -2 });
    expect(e.ruleText.en).toBe("Your move is 2 cells shorter. Lasts 2 rolls.");
  });

  it("factsOf exposes what references need", () => {
    expect(factsOf(effect(effectDoc()))).toEqual({
      entryId: IDS.self,
      slug: "test_effect",
      kind: "effect",
      character: "penalty",
      tags: ["movement"],
      name: { ru: "Тест", en: "Test", uk: "Тест" },
    });
  });
});

describe("compileEntry — effects at turn hooks", () => {
  it("a step modifier reaches the reducer with its reason", () => {
    const mods = hook(effect(effectDoc()), "afterMovement");
    expect(mods.stepsDelta).toBe(-1);
    expect(mods.reasons).toEqual(["effect:test_effect"]);
    expect(mods.consumed).toEqual([]);
  });

  it("a rule whose condition fails contributes nothing at all", () => {
    const e = effect(
      effectDoc({ rules: [{ when: "onOutcome", if: [{ op: "outcome", is: "passed" }], do: [{ op: "balance", amount: 1 }] }] }),
    );
    expect(hook(e, "onOutcome", { turn: { rollSeq: 1, outcome: "dropped" } }).reasons).toEqual([]);
    expect(hook(e, "onOutcome").balanceDelta).toBe(1);
  });

  it("dice, vetoes and cancelled moves map to their patch fields", () => {
    const e = effect(
      effectDoc({
        rules: [
          { when: "beforeMovement", do: [{ op: "dice", count: 1, sides: -2 }] },
          { when: "beforeCellEffect", if: [{ op: "cellType", in: ["penalty"] }], do: [{ op: "skipCellEffect" }] },
          { when: "afterMovement", do: [{ op: "noMove" }] },
        ],
      }),
    );
    const before = hook(e, "beforeMovement");
    expect([before.diceCountDelta, before.diceSidesDelta]).toEqual([1, -2]);
    expect(hook(e, "beforeCellEffect", { turn: { rollSeq: 1, cellType: "penalty" } }).skipCellEffect).toBe(true);
    expect(hook(e, "beforeCellEffect", { turn: { rollSeq: 1, cellType: "bonus" } }).skipCellEffect).toBe(false);
    expect(hook(e, "afterMovement").cancelMove).toBe(true);
  });

  it("a trigger-counted effect asks for a charge only when its rule fires", () => {
    const shield = effect(
      effectDoc({
        character: "bonus",
        duration: { unit: "triggers", count: 1 },
        stacking: { mode: "stack" },
        rules: [{ when: "beforeCellEffect", if: [{ op: "cellType", in: ["penalty"] }], do: [{ op: "skipCellEffect" }] }],
      }),
    );
    expect(hook(shield, "beforeCellEffect", { turn: { rollSeq: 1, cellType: "penalty" } }).consumed).toEqual(["inst-1"]);
    expect(hook(shield, "beforeCellEffect", { turn: { rollSeq: 1, cellType: "normal" } }).consumed).toEqual([]);
    expect(shield.stacking).toEqual({ mode: "stack", maxStacks: null });
    expect(shield.duration).toEqual({ unit: "triggers", count: 1 });
  });

  it("intents from a hook are collected for the executor", () => {
    const e = effect(
      effectDoc({
        character: "bonus",
        rules: [{ when: "onTick", do: [{ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }] }],
      }),
    );
    expect(hook(e, "onTick").intents).toEqual([
      { kind: "grant", entryId: IDS.tailwind, key: "tailwind", entryKind: "effect", to: "sp-me" },
    ]);
  });

  it("each rule keeps its priority; the default is normal", () => {
    const e = effect(
      effectDoc({
        rules: [
          { when: "afterMovement", priority: "early", do: [{ op: "steps", delta: 1 }] },
          { when: "afterMovement", priority: "late", do: [{ op: "steps", delta: 1 }] },
          { when: "afterMovement", do: [{ op: "steps", delta: 1 }] },
        ],
      }),
    );
    expect(e.hooks.afterMovement!.map((r) => [r.ruleIndex, r.priority])).toEqual([
      [0, 50],
      [1, 200],
      [2, 100],
    ]);
  });

  it("random values draw from the turn's rng", () => {
    const e = effect(effectDoc({ rules: [{ when: "afterMovement", do: [{ op: "steps", delta: { random: [1, 4] } }] }] }));
    expect(hook(e, "afterMovement", { rng: rngOf(0) }).stepsDelta).toBe(1);
    expect(hook(e, "afterMovement", { rng: rngOf(0.99) }).stepsDelta).toBe(4);
  });

  it("onApply and onExpire produce intents only", () => {
    const e = effect(
      effectDoc({
        character: "bonus",
        rules: [
          { when: "onApply", do: [{ op: "balance", amount: 2 }] },
          { when: "onExpire", do: [{ op: "cleanse", character: "penalty", count: 1 }] },
          { when: "onExpire", if: [{ op: "chance", percent: 10 }], do: [{ op: "balance", amount: 1 }] },
        ],
      }),
    );
    const at = (trigger: "onApply" | "onExpire") => ctx({ trigger, turn: null, rng: rngOf(0.5) });
    expect(e.onApply.map((r) => r.run(at("onApply")))).toEqual([
      [{ kind: "balance", to: "sp-me", delta: 2, reason: "effect:test_effect" }],
    ]);
    expect(e.onExpire.map((r) => r.run(at("onExpire")))).toEqual([
      [{ kind: "cleanse", from: "sp-me", character: "penalty", tags: [], count: 1 }],
      null,
    ]);
  });

  it("an effect without stacking refreshes", () => {
    expect(effect(effectDoc({ stacking: undefined })).stacking).toEqual({ mode: "refresh", maxStacks: null });
  });
});

describe("compileEntry — items", () => {
  const use = (i: CompiledItem, over: Partial<Parameters<CompiledItem["use"]>[0]> = {}) =>
    i.use({
      params: i.defaults,
      actor: player("sp-me"),
      target: player("sp-them"),
      actorEntries: [],
      targetEntries: [],
      rng: rngOf(0.5),
      ...over,
    });

  it("exposes usage the guards understand", () => {
    expect(item(itemDoc()).usage).toEqual({
      activation: "active",
      window: "anytime",
      target: "other",
      charges: 1,
      unique: false,
      seasonUnique: false,
      filter: null,
      choice: null,
      entryChoice: null,
      pick: null,
    });
    expect(item(itemDoc({ usage: { activation: "active", charges: 2 } })).usage).toMatchObject({
      window: "anytime",
      target: "self",
      charges: 2,
    });
  });

  it("an item aimed at a rival hands them the effect and names it in the feed", () => {
    expect(use(item(itemDoc()))).toEqual({
      // A penalty handed to the chosen player harms them: protection may answer it (wave B, §6.13).
      intents: [{ kind: "grant", entryId: IDS.slowed, key: "slowed", entryKind: "effect", to: "sp-them", harmTo: "sp-them" }],
      feedPayload: { itemKey: "test_item", effectKey: "slowed" },
    });
  });

  it("refuses with the codes the hand-written catalog used", () => {
    const i = item(itemDoc());
    expect(use(i, { target: null }).rejected).toBe("ieeTargetRequired");
    expect(use(i, { target: player("sp-me") }).rejected).toBe("ieeTargetSelfNotAllowed");
    expect(use(i, { target: player("sp-them", { status: "finished" }) }).rejected).toBe("ieeTargetNotActive");
    expect(use(i, { target: null }).intents).toEqual([]);
  });

  it("a self item ignores targets and acts on its user", () => {
    const salve = item(
      itemDoc({
        usage: { activation: "active", charges: 1, target: { who: "self" } },
        rules: [{ when: "onUse", do: [{ op: "cleanse", character: "penalty", count: "all" }] }],
      }),
    );
    expect(use(salve, { target: null })).toEqual({
      intents: [{ kind: "cleanse", from: "sp-me", character: "penalty", tags: [], count: "all" }],
      feedPayload: { itemKey: "test_item" },
    });
  });

  it("conditions see the user's and the target's entries", () => {
    const i = item(
      itemDoc({
        usage: { activation: "active", charges: 1, target: { who: "any" } },
        rules: [
          {
            when: "onUse",
            if: [{ op: "hasEntry", who: "target", entry: { entry: IDS.slowed } }],
            do: [{ op: "balance", amount: 2, to: "target" }],
          },
        ],
      }),
    );
    expect(use(i).intents).toEqual([]);
    expect(use(i, { targetEntries: [FACTS[IDS.slowed]!] }).intents).toEqual([
      { kind: "balance", to: "sp-them", delta: 2, reason: "item:test_item" },
    ]);
    // "any" without a target cannot reach one.
    expect(use(i, { target: null }).rejected).toBe("ieeTargetRequired");
  });
});

describe("compileEntry — instant effects and out-of-turn moves (spec §6.4, §6.9)", () => {
  const shove = (rules: EntryDoc["rules"]) =>
    effect(effectDoc({ duration: { unit: "instant" }, stacking: undefined, rules }));
  const onApply = (e: CompiledEffect, rng = rngOf(0.5)) =>
    e.onApply.map((r) => r.run(ctx({ trigger: "onApply", params: e.defaults, turn: null, rng })));

  it("an instant effect keeps no clock and acts on arrival only", () => {
    const e = shove([{ when: "onApply", do: [{ op: "move", by: -2 }] }]);
    expect(e.duration).toEqual({ unit: "instant", count: null });
    expect(e.hooks).toEqual({});
    expect(onApply(e)).toEqual([[{ kind: "move", who: "sp-me", to: { by: -2 }, key: "test_effect" }]]);
  });

  it("refuses an instant effect with a rule anywhere but on arrival", () => {
    expect(() => shove([{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }])).toThrow(CompileError);
  });

  it("a table roll draws its row from the turn's rng", () => {
    const e = shove([
      {
        when: "onApply",
        do: [{ op: "move", by: { table: { die: 4, rows: [{ upTo: 1, value: -3 }, { upTo: 3, value: 0 }, { upTo: 4, value: 5 }] } } }],
      },
    ]);
    const by = (r: number) => (onApply(e, rngOf(r))[0]![0] as { to: { by: number } }).to.by;
    expect([by(0), by(0.3), by(0.6), by(0.99)]).toEqual([-3, 0, 0, 5]);
  });

  it("the rival-moving primitives name the holder; the executor finds the rival at execution", () => {
    const e = shove([
      { when: "onApply", do: [{ op: "halveGap", who: "nearestBehind" }] },
      { when: "onApply", do: [{ op: "swapPositions", with: "nearestBehind" }] },
      { when: "onApply", do: [{ op: "rollbackLastMove", who: "self" }] },
    ]);
    expect(onApply(e)).toEqual([
      [{ kind: "move", who: { nearestBehind: "sp-me" }, to: { halfwayTo: "sp-me" }, key: "test_effect" }],
      [{ kind: "move", who: "sp-me", to: { swapWith: { nearestBehind: "sp-me" } }, key: "test_effect" }],
      [{ kind: "move", who: "sp-me", to: { lastMoveStart: true }, key: "test_effect" }],
    ]);
  });

  it("marks an effect that moves the nearest rival behind on arrival, so the wheel can skip it", () => {
    expect(shove([{ when: "onApply", do: [{ op: "halveGap", who: "nearestBehind" }] }]).needsBehind).toBe(true);
    expect(shove([{ when: "onApply", do: [{ op: "swapPositions", with: "nearestBehind" }] }]).needsBehind).toBe(true);
    expect(shove([{ when: "onApply", do: [{ op: "move", by: 2 }] }]).needsBehind).toBe(false);
    // Only on arrival: later the holder's place may have changed.
    const later = effect(effectDoc({ rules: [{ when: "onExpire", do: [{ op: "halveGap", who: "nearestBehind" }] }] }));
    expect(later.needsBehind).toBe(false);
  });
});

describe("compileEntry — items that move players", () => {
  const use = (i: CompiledItem, over: Partial<Parameters<CompiledItem["use"]>[0]> = {}) =>
    i.use({
      params: i.defaults,
      actor: player("sp-me"),
      target: player("sp-them"),
      actorEntries: [],
      targetEntries: [],
      rng: rngOf(0.5),
      ...over,
    });
  const aimed = (doc: EntryDoc["rules"]) =>
    item(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "other" } }, rules: doc }));

  it("moves to, swaps with or rolls back the chosen player", () => {
    expect(use(aimed([{ when: "onUse", do: [{ op: "moveToTarget", at: "before" }] }])).intents).toEqual([
      { kind: "move", who: "sp-me", to: { player: "sp-them", at: "before" }, key: "test_item" },
    ]);
    // What sets the chosen player back harms them (D9): the intents say whom (wave B, §6.13).
    expect(use(aimed([{ when: "onUse", do: [{ op: "swapPositions", with: "target" }] }])).intents).toEqual([
      { kind: "move", who: "sp-me", to: { swapWith: "sp-them" }, key: "test_item", harmTo: "sp-them" },
    ]);
    expect(use(aimed([{ when: "onUse", do: [{ op: "rollbackLastMove", who: "target" }] }])).intents).toEqual([
      { kind: "move", who: "sp-them", to: { lastMoveStart: true }, key: "test_item", harmTo: "sp-them" },
    ]);
    expect(use(aimed([{ when: "onUse", do: [{ op: "move", by: -2, who: "target" }] }])).intents).toEqual([
      { kind: "move", who: "sp-them", to: { by: -2 }, key: "test_item", harmTo: "sp-them" },
    ]);
    // Forward is a gift, not an attack.
    expect(use(aimed([{ when: "onUse", do: [{ op: "move", by: 2, who: "target" }] }])).intents).toEqual([
      { kind: "move", who: "sp-them", to: { by: 2 }, key: "test_item" },
    ]);
  });
});

describe("compileEntry — cursed and passive items (spec §6.10)", () => {
  const heavy = item(
    itemDoc({
      character: "penalty",
      usage: { activation: "cursed", charges: 1 },
      rules: [
        { when: "afterDice", do: [{ op: "resultModify", delta: -2 }] },
        { when: "onPickup", do: [{ op: "balance", amount: -1 }] },
      ],
    }),
  );

  it("a cursed item works at the turn hooks, spends a charge each time, and is unique and never used", () => {
    expect(heavy.usage).toEqual({
      activation: "cursed",
      window: "anytime",
      target: "none",
      charges: 1,
      seasonUnique: false,
      unique: true,
      filter: null,
      choice: null,
      entryChoice: null,
      pick: null,
    });
    const patch = heavy.hooks.afterDice![0]!.run(ctx({ trigger: "afterDice", params: heavy.defaults }));
    expect(patch).toMatchObject({ resultDelta: -2, consumeCharge: true, reason: "item:test_item" });
    expect(heavy.onPickup.map((r) => r.run(ctx({ trigger: "onPickup", turn: null })))).toEqual([
      [{ kind: "balance", to: "sp-me", delta: -1, reason: "item:test_item" }],
    ]);
    expect(
      heavy.use({ params: {}, actor: player("sp-me"), target: null, actorEntries: [], targetEntries: [], rng: rngOf(0.5) }).rejected,
    ).toBe("ieeItemNotUsable");
  });

  it("a passive item without charges stays while held: nothing is spent", () => {
    const crown = item(itemDoc({ usage: { activation: "passive" }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }] }));
    expect(crown.usage).toMatchObject({ activation: "passive", charges: null, unique: false });
    expect(crown.hooks.afterMovement![0]!.run(ctx())).not.toHaveProperty("consumeCharge");
  });

  it("an active item has no hooks; its pick and its filter are read from the document", () => {
    const amulet = item(
      itemDoc({
        usage: { activation: "active", charges: 1, target: { who: "self" } },
        rules: [{ when: "onUse", do: [{ op: "remove", what: "any", character: "penalty", pick: "choice" }] }],
      }),
    );
    expect(amulet.hooks).toEqual({});
    expect(amulet.usage.choice).toEqual({ what: "any", character: "penalty", entryId: null, rarity: null });
    const use = (choice: string | null) =>
      amulet.use({ params: {}, actor: player("sp-me"), target: null, actorEntries: [], targetEntries: [], rng: rngOf(0.5), choice }).intents;
    expect(use("inst-9")).toEqual([
      { kind: "remove", from: "sp-me", what: "any", character: "penalty", entryId: null, rarity: null, pick: { instanceId: "inst-9" }, count: 1 },
    ]);
    expect(use(null)).toEqual([]);

    const magnet = item(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "other", filter: "ahead" } } }));
    expect(magnet.usage.filter).toBe("ahead");
  });
});

describe("compileEntry — standing, items held, the chosen player's roll (wave A)", () => {
  const steps = (cond: Record<string, unknown>) =>
    effect(effectDoc({ rules: [{ when: "afterMovement", if: [cond as never], do: [{ op: "steps", delta: 2 }] }] }));
  const fires = (e: CompiledEffect, c: Partial<RuleContext>) => hook(e, "afterMovement", c).stepsDelta === 2;
  const heldItem = (character: "bonus" | "penalty") => ({ ...FACTS[IDS.tailwind]!, kind: "item" as const, character });

  it("a place: the leader, the last, or within the first few — as the turn started", () => {
    const leader = steps({ op: "rank", is: "leader" });
    expect(fires(leader, { self: player("sp-me", { rank: 1 }) })).toBe(true);
    expect(fires(leader, { self: player("sp-me", { rank: 2 }) })).toBe(false);
    const last = steps({ op: "rank", is: "last" });
    expect(fires(last, { self: player("sp-me", { behind: 0 }) })).toBe(true);
    expect(fires(last, { self: player("sp-me", { behind: 2 }) })).toBe(false);
    // Nobody counted who is behind: not last.
    expect(fires(last, { self: player("sp-me") })).toBe(false);
    expect(fires(steps({ op: "rank", lte: 3 }), { self: player("sp-me", { rank: 3 }) })).toBe(true);
  });

  it("items held, of a character or all of them", () => {
    const two = steps({ op: "itemCount", cmp: "gte", value: 2, character: "bonus" });
    expect(fires(two, { selfEntries: [heldItem("bonus"), heldItem("bonus")] })).toBe(true);
    // A cursed item and an effect are not bonus items.
    expect(fires(two, { selfEntries: [heldItem("bonus"), heldItem("penalty"), FACTS[IDS.tailwind]!] })).toBe(false);
    expect(fires(steps({ op: "itemCount", cmp: "eq", value: 0 }), { selfEntries: [] })).toBe(true);
  });

  it("where the chosen player stands, and their last roll against this one", () => {
    const ahead = steps({ op: "targetRelative", is: "ahead" });
    expect(fires(ahead, { target: player("sp-rival", { position: 14 }) })).toBe(true);
    expect(fires(ahead, { target: player("sp-rival", { position: 6 }) })).toBe(false);
    expect(fires(ahead, { target: null })).toBe(false);
    const magnet = steps({ op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" });
    const turn = (dice: number[]) => ({ rollSeq: 4, outcome: "passed" as const, diceResults: dice });
    expect(fires(magnet, { turn: turn([2]), target: player("sp-rival", { lastRoll: 5 }) })).toBe(true);
    expect(fires(magnet, { turn: turn([5]), target: player("sp-rival", { lastRoll: 5 }) })).toBe(false);
    // A player who has not moved yet, or nobody chosen: nothing to compare with.
    expect(fires(magnet, { turn: turn([1]), target: player("sp-rival", { lastRoll: null }) })).toBe(false);
    expect(fires(magnet, { turn: turn([1]), target: null })).toBe(false);
  });

  it("a number read from the moment: the dice, so many per item, the chosen player's last roll", () => {
    const delta = (value: Record<string, unknown>) =>
      effect(effectDoc({ rules: [{ when: "afterMovement", do: [{ op: "steps", delta: value as never }] }] }));
    const turn = { rollSeq: 4, outcome: "passed" as const, diceResults: [3, 4] };
    expect(hook(delta({ source: "diceSum" }), "afterMovement", { turn }).stepsDelta).toBe(7);
    const burden = delta({ source: "itemCount", multiplier: -1 });
    expect(hook(burden, "afterMovement", { selfEntries: [heldItem("bonus"), heldItem("penalty")] }).stepsDelta).toBe(-2);
    expect(hook(delta({ source: "itemCount", character: "penalty", multiplier: 2 }), "afterMovement", { selfEntries: [heldItem("bonus"), heldItem("penalty")] }).stepsDelta).toBe(2);
    expect(hook(delta({ source: "targetLastRoll" }), "afterMovement", { target: player("sp-rival", { lastRoll: 9 }) }).stepsDelta).toBe(9);
    // Nothing to read is nothing to add.
    expect(hook(delta({ source: "targetLastRoll" }), "afterMovement", { target: null }).stepsDelta).toBe(0);
  });

  it("an effect its user keeps remembers whom the item was aimed at (spec §6.11)", () => {
    const magnet = item(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "other" } }, rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }] }] }));
    const use = magnet.use({ params: {}, actor: player("sp-me"), target: player("sp-rival"), actorEntries: [], targetEntries: [], rng: rngOf(0.5) });
    expect(use.intents).toEqual([{ kind: "grant", entryId: IDS.tailwind, key: "tailwind", entryKind: "effect", to: "sp-me", aimedAt: "sp-rival" }]);
    // Handed to the chosen player, it remembers nobody: they are its holder.
    const hex = item(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "other" } }, rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" }] }] }));
    const cast = hex.use({ params: {}, actor: player("sp-me"), target: player("sp-rival"), actorEntries: [], targetEntries: [], rng: rngOf(0.5) });
    expect(cast.intents[0]).not.toHaveProperty("aimedAt");
  });

  it("the next game is one game, counted like a single roll", () => {
    const e = effect(effectDoc({ duration: { unit: "next_game" } }));
    expect(e.duration).toEqual({ unit: "next_game", count: 1 });
  });
});

describe("compileEntry — item operations (wave B, spec §6.12)", () => {
  const use = (it: CompiledItem, over: Partial<Parameters<CompiledItem["use"]>[0]> = {}) =>
    it.use({ params: {}, actor: player("sp-me"), target: player("sp-rival"), actorEntries: [], targetEntries: [], rng: rngOf(0.5), ...over });

  it("an item that hands out a pick from the catalog says what it may pick, and hands out the one picked", () => {
    const joker = item(
      itemDoc({
        usage: { activation: "active", charges: 1, target: { who: "self" } },
        rules: [{ when: "onUse", do: [{ op: "grantChosen", rarity: ["common"], activation: "active" }] }],
      }),
    );
    expect(joker.usage.entryChoice).toEqual({ rarity: ["common"], activation: "active" });
    expect(joker.usage.choice).toBeNull();
    expect(use(joker, { target: null, entryChoice: IDS.salve }).intents).toEqual([
      { kind: "grant", entryId: IDS.salve, key: "cleansing_salve", entryKind: "item", to: "sp-me" },
    ]);
    expect(use(joker, { target: null }).intents).toEqual([]);
    // Any rarity, any activation: the filter says nothing.
    const any = item(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "self" } }, rules: [{ when: "onUse", do: [{ op: "grantChosen" }] }] }));
    expect(any.usage.entryChoice).toEqual({ rarity: null, activation: null });
  });

  it("the stone: a pick of the user's own of a rarity, and one of the catalog", () => {
    const stone = item(
      itemDoc({
        usage: { activation: "active", charges: 1, target: { who: "self" } },
        rules: [
          {
            when: "onUse",
            do: [
              { op: "remove", what: "item", character: "bonus", rarity: ["common"], pick: "choice" },
              { op: "grantChosen", rarity: ["common"] },
            ],
          },
        ],
      }),
    );
    expect(stone.usage.choice).toEqual({ what: "item", character: "bonus", entryId: null, rarity: ["common"] });
    expect(stone.usage.entryChoice).toEqual({ rarity: ["common"], activation: null });
    expect(use(stone, { target: null, choice: "inst-old", entryChoice: IDS.salve }).intents.map((i) => i.kind)).toEqual(["remove", "grant"]);
  });

  it("the item in use is left where it is: its instance rides on what moves items", () => {
    const glove = item(itemDoc({ rules: [{ when: "onUse", do: [{ op: "stealItem" }] }] }));
    expect(use(glove, { instanceId: "inst-glove" }).intents).toEqual([
      { kind: "moveItems", from: "sp-rival", to: "sp-me", count: 1, rarity: null, how: "stolen", except: "inst-glove", harmTo: "sp-rival" },
    ]);
  });

  it("a wheel spun once more is a patch of the hook it runs at", () => {
    const map = effect(effectDoc({ rules: [{ when: "afterCellEffect", if: [{ op: "cellType", in: ["bonus"] }], do: [{ op: "extraSpin", pool: "bonus" }] }] }));
    expect(hook(map, "afterCellEffect", { turn: { rollSeq: 4, outcome: "passed", cellType: "bonus" } }).extraSpins).toEqual(["positive"]);
    expect(hook(map, "afterCellEffect", { turn: { rollSeq: 4, outcome: "passed", cellType: "normal" } }).extraSpins).toEqual([]);
  });
});

describe("compileEntry — what arrives, and protection (wave B, spec §6.13)", () => {
  const arriving = (is: "harm" | "entry" | "moveBack") => ctx({ trigger: "onIncoming", turn: null, arrival: { is, entry: null } });

  it("a held item answers what arrives with its tier; an active one and a plain effect answer nothing", () => {
    const shield = item(
      itemDoc({
        usage: { activation: "passive", charges: 1 },
        protection: { tier: 2 },
        rules: [{ when: "onIncoming", if: [{ op: "incoming", is: "harm" }], do: [{ op: "block" }] }],
      }),
    );
    expect(shield.protectionTier).toBe(2);
    expect(shield.hooks).toEqual({});
    expect(shield.incoming).toHaveLength(1);
    expect(shield.incoming[0]!.run(arriving("harm"))).toEqual({ kind: "block" });
    expect(shield.incoming[0]!.run(arriving("moveBack"))).toBeNull();
    expect(item(itemDoc()).incoming).toEqual([]);
    expect(item(itemDoc()).protectionTier).toBe(1);
    expect(effect(effectDoc()).standing).toEqual([]);
  });

  it("an effect answers and holds while it lasts", () => {
    const e = effect(
      effectDoc({
        rules: [
          { when: "onIncoming", do: [{ op: "replace", with: 1 }] },
          { when: "whileActive", do: [{ op: "untargetable" }, { op: "pierce", value: 1 }] },
          { when: "whileActive", if: [{ op: "rank", is: "leader" }], do: [{ op: "forbidItems" }] },
        ],
      }),
    );
    expect(e.incoming[0]!.run(arriving("entry"))).toEqual({ kind: "replace", with: 1 });
    const still = ctx({ trigger: "whileActive", turn: null, self: player("sp-me", { rank: 1 }) });
    expect(e.standing.map((r) => r.run(still))).toEqual([
      { untargetable: true, forbidItems: false, pierce: 1, holdLimit: null, conditionImmunity: false },
      { untargetable: false, forbidItems: true, pierce: 0, holdLimit: null, conditionImmunity: false },
    ]);
    expect(e.standing[1]!.run(ctx({ trigger: "whileActive", turn: null, self: player("sp-me", { rank: 3 }) }))).toBeNull();
  });

  it("marks only what harms the chosen player: not the user's own gains, not an item used on oneself", () => {
    const drain = item(
      itemDoc({
        usage: { activation: "active", charges: 1, target: { who: "any" } },
        rules: [{ when: "onUse", do: [{ op: "balance", amount: -2, to: "target" }, { op: "balance", amount: 2 }] }],
      }),
    );
    const on = (target: string) =>
      drain.use({ params: {}, actor: player("sp-me"), target: player(target), actorEntries: [], targetEntries: [], rng: rngOf(0.5) }).intents;
    expect(on("sp-rival")).toEqual([
      { kind: "balance", to: "sp-rival", delta: -2, reason: "item:test_item", harmTo: "sp-rival" },
      { kind: "balance", to: "sp-me", delta: 2, reason: "item:test_item" },
    ]);
    expect(on("sp-me").every((i) => i.harmTo === undefined)).toBe(true);
  });

  it("refuses an active item that answers what arrives", () => {
    expect(() =>
      compileEntry({ entryId: IDS.self, revisionId: REV, doc: itemDoc({ rules: [{ when: "onIncoming", do: [{ op: "block" }] }] }), resolve }),
    ).toThrow(CompileError);
  });
});

describe("compileEntry — refuses what this build cannot run", () => {
  it("throws on documents that skipped the checks", () => {
    const run = (doc: EntryDoc) => () => compileEntry({ entryId: IDS.self, revisionId: REV, doc, resolve });
    expect(run(itemDoc({ character: "penalty", usage: { activation: "cursed" } }))).toThrow(CompileError);
    expect(run({ ...effectDoc(), duration: undefined })).toThrow(CompileError);
    expect(run(effectDoc({ rules: [{ when: "onLanding", do: [{ op: "steps", delta: 1 }] }] }))).toThrow(CompileError);
    expect(run(effectDoc({ rules: [{ when: "afterMovement", do: [{ op: "warp" }] }] }))).toThrow(CompileError);
    expect(run(effectDoc({ rules: [{ when: "afterMovement", if: [{ op: "moon" }], do: [{ op: "noMove" }] }] }))).toThrow(
      CompileError,
    );
    expect(run(effectDoc({ rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }] }))).toThrow(CompileError);
  });
});

describe("compileEntry — reaction items (wave B, spec §6.15)", () => {
  const reaction = (rules: EntryDoc["rules"]) =>
    item(itemDoc({ usage: { activation: "active", window: "after_dice", charges: 1 }, rules }));
  const turn = (diceResults: number[]) => ({ rollSeq: 5, outcome: "passed" as const, diceResults, diceCount: diceResults.length, diceSides: 6 });
  const input = (diceResults: number[]) => ({ params: {}, actor: player("sp-me"), turn: turn(diceResults), actorEntries: [], rng: () => 0.5 });

  it("is used after the dice, on its holder: the window answers with what its rules ask of the throw", () => {
    const coin = reaction([{ when: "onUse", do: [{ op: "reroll" }] }]);
    expect(coin.usage).toMatchObject({ activation: "active", window: "after_dice", target: "self" });
    expect(coin.react?.(input([2]))).toEqual({ reroll: true, bestOfTwo: false, rerollValues: [], resultDelta: 0, resultCap: null });
    const elixir = reaction([{ when: "onUse", do: [{ op: "resultModify", delta: 1, cap: 5 }] }]);
    expect(elixir.react?.(input([2]))).toMatchObject({ resultDelta: 1, resultCap: 5 });
  });

  it("only the rules whose conditions hold on the throw — none: no answer", () => {
    const onOne = reaction([{ when: "onUse", if: [{ op: "diceShow", of: "any", cmp: "eq", value: 1 }], do: [{ op: "rerollOn", values: [1] }] }]);
    expect(onOne.react?.(input([1]))).toMatchObject({ rerollValues: [1] });
    expect(onOne.react?.(input([4]))).toBeNull();
  });

  it("every other item has no answer to give", () => {
    expect(item(itemDoc()).react).toBeUndefined();
  });
});

describe("compileEntry — the next game (wave C, spec §6.16)", () => {
  const veto = itemDoc({
    slug: "genre_veto",
    usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "genre" },
    rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }] }],
  });
  const use = (it: CompiledItem, over: Partial<Parameters<CompiledItem["use"]>[0]> = {}) =>
    it.use({ params: {}, actor: player("sp-me"), target: null, actorEntries: [], targetEntries: [], rng: rngOf(0.5), ...over });

  it("an item that asks for a pick says which, and is not used without one of that kind", () => {
    const i = item(veto);
    expect(i.usage.pick).toBe("genre");
    expect(use(i).rejected).toBe("ieePickRequired");
    expect(use(i, { pick: { years: [1990, 1999] } }).rejected).toBe("ieePickRequired");
    // What it hands its user remembers the pick.
    expect(use(i, { pick: { genre: "horror" } })).toEqual({
      intents: [{ kind: "grant", entryId: IDS.tailwind, key: "tailwind", entryKind: "effect", to: "sp-me", chosen: { genre: "horror" } }],
      feedPayload: { itemKey: "genre_veto" },
    });
    // An item that asks for nothing never reads a pick sent along.
    expect(item(itemDoc()).usage.pick).toBeNull();
  });

  it("an effect's rules at beforeGameRoll shape the pick: what they exclude, require and favour", () => {
    const e = effect(
      effectDoc({
        character: "bonus",
        duration: { unit: "next_game" },
        rules: [
          { when: "beforeGameRoll", do: [{ op: "poolRequire", genres: "picked" }] },
          { when: "beforeGameRoll", if: [{ op: "chance", percent: 50 }], do: [{ op: "poolExclude", rating: { max: 2 } }] },
        ],
      }),
    );
    expect(e.hooks).toEqual({});
    expect(e.pool.map((r) => r.ruleIndex)).toEqual([0, 1]);
    const asked = ctx({ trigger: "beforeGameRoll", turn: null, chosen: { genre: "rpg" }, rng: rngOf(0.75) });
    expect(e.pool[0]!.run(asked)).toEqual([{ kind: "require", match: { genres: ["rpg"] } }]);
    // A condition that does not hold says nothing.
    expect(e.pool[1]!.run(asked)).toBeNull();
    expect(e.pool[1]!.run({ ...asked, rng: rngOf(0.25) })).toEqual([{ kind: "exclude", match: { rating: { min: null, max: 2 } } }]);
  });

  it("a passive or cursed item shapes its holder's pick while held; an active one has no such rules", () => {
    const charm = item(itemDoc({ usage: { activation: "passive" }, rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "lastPassed" }] }] }));
    expect(charm.pool).toHaveLength(1);
    expect(charm.hooks).toEqual({});
    expect(charm.usage.pick).toBeNull();
    expect(item(itemDoc()).pool).toEqual([]);
    expect(() => item(itemDoc({ rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "lastPassed" }] }] }))).toThrow(CompileError);
  });
});

describe("compileEntry — completion conditions (wave C, spec §6.17)", () => {
  const hard = { op: "addCondition", text: { ru: "На высокой сложности", en: "On hard" } } as const;

  it("an effect's rules at onRollCreated give the game its conditions, when theirs hold", () => {
    const e = effect(
      effectDoc({
        duration: { unit: "next_game" },
        tags: ["game_condition"],
        rules: [
          { when: "onRollCreated", do: [hard] },
          { when: "onRollCreated", if: [{ op: "chance", percent: 50 }], do: [{ op: "addCondition", text: { ru: "Без смертей" } }] },
        ],
      }),
    );
    expect(e.hooks).toEqual({});
    expect(e.rollCreated.map((r) => r.ruleIndex)).toEqual([0, 1]);
    const assigned = ctx({ trigger: "onRollCreated", turn: null, rng: rngOf(0.75) });
    expect(e.rollCreated[0]!.run(assigned)).toEqual([{ ru: "На высокой сложности", en: "On hard" }]);
    expect(e.rollCreated[1]!.run(assigned)).toBeNull();
    expect(e.rollCreated[1]!.run({ ...assigned, rng: rngOf(0.25) })).toEqual([{ ru: "Без смертей" }]);
  });

  it("a passive or cursed item gives conditions while held; an active one has no such rules; immunity holds while it lasts", () => {
    const curse = item(itemDoc({ character: "penalty", usage: { activation: "cursed", charges: 1 }, rules: [{ when: "onRollCreated", do: [hard] }] }));
    expect(curse.rollCreated).toHaveLength(1);
    expect(item(itemDoc()).rollCreated).toEqual([]);
    expect(() => item(itemDoc({ rules: [{ when: "onRollCreated", do: [hard] }] }))).toThrow(CompileError);
    const free = effect(effectDoc({ character: "bonus", rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] }));
    expect(free.standing[0]!.run(ctx({ trigger: "whileActive", turn: null }))).toMatchObject({ conditionImmunity: true, untargetable: false });
  });
});

describe("compileEntry — objects on the board (wave D, spec §6.18)", () => {
  const usage = { activation: "active", window: "anytime", target: { who: "self" }, charges: 1, pick: "cell" } as const;

  it("an item that places itself keeps its rules for a move entering its cell, each run when its conditions hold", () => {
    const pit = item(
      itemDoc({
        usage,
        rules: [
          { when: "onUse", do: [{ op: "placeObject" }] },
          { when: "onObjectEntered", do: [{ op: "stopMove" }, { op: "push", delta: -2 }] },
          { when: "onObjectEntered", if: [{ op: "outcome", is: "dropped" }], do: [{ op: "stopMove" }, { op: "spinInstead", pool: "penalty" }] },
        ],
      }),
    );
    expect(pit.objectEntered.map((r) => r.ruleIndex)).toEqual([1, 2]);
    // Nothing of it acts at the holder's turns: it is used, then it stands on the board.
    expect(pit.hooks).toEqual({});
    const entered = ctx({ trigger: "onObjectEntered" });
    expect(pit.objectEntered[0]!.run(entered)).toEqual({ stop: true, push: -2, extend: 0, spin: null });
    expect(pit.objectEntered[1]!.run(entered)).toBeNull();
    expect(pit.objectEntered[1]!.run({ ...entered, turn: { rollSeq: 4, outcome: "dropped" } })).toEqual({ stop: true, push: 0, extend: 0, spin: "negative" });
  });

  it("no other entry stands on the board", () => {
    expect(item(itemDoc()).objectEntered).toEqual([]);
    expect(() => effect(effectDoc({ rules: [{ when: "onObjectEntered", do: [{ op: "stopMove" }] }] }))).toThrow(CompileError);
    expect(() => item(itemDoc({ usage: { activation: "passive" }, rules: [{ when: "onObjectEntered", do: [{ op: "stopMove" }] }] }))).toThrow(CompileError);
  });
});

describe("compileEntry — the same cell (wave D, spec §6.19)", () => {
  const crown = itemDoc({
    rarity: "epic",
    usage: { activation: "passive", unique: "season" },
    rules: [
      { when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: 1 }] },
      { when: "onSameCell", do: [{ op: "takeEntry" }] },
    ],
  });

  it("a held item one in the season, taken by the rival who arrives on its holder's cell", () => {
    const c = item(crown);
    expect(c.usage).toMatchObject({ activation: "passive", unique: true, seasonUnique: true });
    expect(c.sameCell.map((r) => r.ruleIndex)).toEqual([1]);
    expect(c.sameCell[0]!.run(ctx({ trigger: "onSameCell", turn: null }))).toEqual({ intents: [], take: true });
    // Its dice rule acts at the holder's turns, as a held item's does.
    expect(c.hooks.afterDice).toHaveLength(1);
  });

  it("an effect's rules there ask for what it hands out, when theirs hold; an active item has no such moment", () => {
    const e = effect(
      effectDoc({
        character: "bonus",
        rules: [{ when: "onSameCell", if: [{ op: "chance", percent: 50 }], do: [{ op: "balance", amount: 2 }] }],
      }),
    );
    expect(e.sameCell[0]!.run(ctx({ trigger: "onSameCell", turn: null, rng: rngOf(0.25) }))).toEqual({
      intents: [{ kind: "balance", to: "sp-me", delta: 2, reason: "effect:test_effect" }],
      take: false,
    });
    expect(e.sameCell[0]!.run(ctx({ trigger: "onSameCell", turn: null, rng: rngOf(0.75) }))).toBeNull();
    expect(item(itemDoc()).sameCell).toEqual([]);
    expect(() => item(itemDoc({ rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }, { when: "onSameCell", do: [{ op: "takeEntry" }] }] }))).toThrow(CompileError);
  });
});

