import { describe, expect, it } from "vitest";

import { checkEntry, checkEntrySet, grantsOf, type IssueCode } from "./check";
import type { EntryDoc, RuleDoc } from "./doc";
import { IDS, effectDoc, itemDoc, resolve } from "./fixtures.test-helpers";

const ctx = { entryId: IDS.self, resolve };

function codes(raw: unknown): { errors: IssueCode[]; warnings: IssueCode[] } {
  const r = checkEntry(raw, ctx);
  return { errors: r.errors.map((e) => e.code), warnings: r.warnings.map((w) => w.code) };
}

type Op = { op: string; [key: string]: unknown };

const rule = (when: string, act: Op[], cond?: Op[]): RuleDoc => ({
  when,
  ...(cond ? { if: cond } : {}),
  do: act,
});

describe("checkEntry — a sound document passes", () => {
  it("effect and item fixtures have no errors and no warnings", () => {
    expect(codes(effectDoc())).toEqual({ errors: [], warnings: [] });
    expect(codes(itemDoc())).toEqual({ errors: [], warnings: [] });
  });

  it("returns the parsed document alongside its issues", () => {
    const r = checkEntry(effectDoc({ glyph: "NotAGlyphIcon" }), ctx);
    expect(r.doc?.slug).toBe("test_effect");
    expect(r.warnings.map((w) => w.code)).toEqual(["glyph_unknown"]);
  });
});

describe("checkEntry — blocking errors", () => {
  it("schema: a broken frame stops before anything else", () => {
    const r = checkEntry({ dslVersion: 1, kind: "effect" }, ctx);
    expect(r.doc).toBeNull();
    expect(r.errors.every((e) => e.code === "schema")).toBe(true);
    expect(r.errors.some((e) => e.path[0] === "slug")).toBe(true);
  });

  it("an op's own parameters are validated with its schema, path included", () => {
    const r = checkEntry(effectDoc({ rules: [rule("afterMovement", [{ op: "steps", delta: "two" }])] }), ctx);
    expect(r.errors[0]).toMatchObject({ code: "schema", path: ["rules", 0, "do", 0, "delta"] });
    const c = checkEntry(
      effectDoc({ rules: [rule("afterMovement", [{ op: "steps", delta: 1 }], [{ op: "outcome", is: "won" }])] }),
      ctx,
    );
    expect(c.errors[0]).toMatchObject({ code: "schema", path: ["rules", 0, "if", 0, "is"] });
  });

  it("unknown trigger, condition and action", () => {
    expect(codes(effectDoc({ rules: [rule("onLanding", [{ op: "steps", delta: 1 }])] })).errors).toEqual([
      "unknown_trigger",
    ]);
    expect(codes(effectDoc({ rules: [rule("afterMovement", [{ op: "steps", delta: 1 }], [{ op: "moon" }])] })).errors).toEqual([
      "unknown_condition",
    ]);
    expect(codes(effectDoc({ rules: [rule("afterMovement", [{ op: "teleport", to: 3 }])] })).errors).toEqual([
      "unknown_action",
    ]);
  });

  it("not_available: later waves' features are named, not silently ignored", () => {
    expect(codes(effectDoc({ stacking: { mode: "refresh", group: "result" } })).errors).toEqual(["not_available"]);
    // Stacking groups moved to wave B at wave A's gate: no wave-A entry needed one.
    expect(checkEntry(effectDoc({ stacking: { mode: "refresh", group: "result" } }), ctx).errors[0]?.params).toMatchObject({ what: "group", stage: "B" });
  });

  it("the next game: one game, no count (wave A)", () => {
    expect(codes(effectDoc({ duration: { unit: "next_game" } })).errors).toEqual([]);
    expect(codes(effectDoc({ duration: { unit: "next_game", count: 2 } })).errors).toEqual(["duration_count"]);
  });

  it("source_action, source_unavailable: a number reads the moment only where it can (wave A)", () => {
    const at = (when: string, op: Op) => codes(effectDoc({ rules: [rule(when, [op])] })).errors;
    // The dice are known from the throw on.
    expect(at("afterMovement", { op: "steps", delta: { source: "diceSum" } })).toEqual([]);
    expect(at("afterDice", { op: "resultModify", delta: { source: "itemCount", multiplier: -1 } })).toEqual([]);
    expect(at("onApply", { op: "move", by: { source: "diceSum" } })).toEqual(["source_unavailable"]);
    // The dice's composition cannot say "for each item you hold".
    expect(at("beforeMovement", { op: "dice", count: { source: "itemCount", multiplier: 1 } })).toEqual(["source_action"]);
    // An effect at the hooks may read the player its item was aimed at; an item's use only when aimed.
    expect(at("afterCellEffect", { op: "balance", amount: { source: "targetLastRoll" } })).toEqual([]);
    const use = (usage: NonNullable<EntryDoc["usage"]>) =>
      codes(itemDoc({ usage, rules: [rule("onUse", [{ op: "move", by: { source: "targetLastRoll" } }])] })).errors;
    expect(use({ activation: "active", charges: 1, target: { who: "other" } })).toEqual([]);
    expect(use({ activation: "active", charges: 1, target: { who: "self" } })).toEqual(["source_unavailable"]);
    // A multiplier of nothing is no count at all.
    expect(at("afterMovement", { op: "steps", delta: { source: "itemCount", multiplier: 0 } })).toEqual(["schema"]);
  });

  it("target_unavailable: a remembered player is read at the turn's hooks only (wave A, spec §6.11)", () => {
    const cond = (when: string, c: Op) =>
      codes(effectDoc({ rules: [{ when, if: [c], do: [{ op: when === "afterMovement" ? "steps" : "balance", ...(when === "afterMovement" ? { delta: 2 } : { amount: 1 }) }] }] })).errors;
    const magnet = { op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" };
    expect(cond("afterMovement", magnet)).toEqual([]);
    expect(cond("afterMovement", { op: "targetRelative", is: "ahead" })).toEqual([]);
    expect(cond("onApply", { op: "targetRelative", is: "ahead" })).toEqual(["target_unavailable"]);
    // What the remembered player holds is not kept: that is still an aimed item's use only.
    expect(cond("afterMovement", { op: "hasEntry", who: "target", character: "bonus" })).toEqual(["target_unavailable"]);
    // A held item remembers nobody.
    const held = codes(itemDoc({ usage: { activation: "passive" }, rules: [{ when: "afterMovement", if: [magnet], do: [{ op: "steps", delta: 2 }] }] })).errors;
    expect(held).toEqual(["target_unavailable"]);
  });

  it("trigger_kind: an instant effect acts on arrival only (wave A)", () => {
    expect(codes(effectDoc({ duration: { unit: "instant" }, rules: [rule("onApply", [{ op: "move", by: -2 }])] })).errors).toEqual([]);
    expect(codes(effectDoc({ duration: { unit: "instant" } })).errors).toEqual(["trigger_kind"]);
  });

  it("trigger_kind: an effect cannot be used, an active item has no turn hooks", () => {
    expect(codes(effectDoc({ rules: [rule("onUse", [{ op: "balance", amount: 1 }])] })).errors).toContain("trigger_kind");
    expect(
      codes(itemDoc({ rules: [rule("onUse", [{ op: "balance", amount: 1 }]), rule("afterMovement", [{ op: "steps", delta: 1 }])] }))
        .errors,
    ).toEqual(["trigger_kind"]);
  });

  it("action_trigger and condition_trigger: a primitive in the wrong place", () => {
    expect(codes(effectDoc({ rules: [rule("beforeMovement", [{ op: "steps", delta: 1 }])] })).errors).toEqual([
      "action_trigger",
    ]);
    expect(codes(effectDoc({ rules: [rule("afterMovement", [{ op: "skipCellEffect" }])] })).errors).toEqual([
      "action_trigger",
    ]);
    expect(
      codes(effectDoc({ rules: [rule("afterMovement", [{ op: "steps", delta: 1 }], [{ op: "cellType", in: ["bonus"] }])] }))
        .errors,
    ).toEqual(["condition_trigger"]);
    expect(
      codes(effectDoc({ rules: [rule("onApply", [{ op: "balance", amount: 1 }], [{ op: "outcome", is: "passed" }])] })).errors,
    ).toEqual(["condition_trigger"]);
  });

  it("target_unavailable: only an item aimed at a player has a chosen player", () => {
    expect(
      codes(effectDoc({ rules: [rule("onApply", [{ op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" }])] }))
        .errors,
    ).toEqual(["target_unavailable"]);
    expect(
      codes(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "self" } } })).errors,
    ).toEqual(["target_unavailable"]);
    expect(
      codes(
        itemDoc({
          usage: { activation: "active", charges: 1, target: { who: "self" } },
          rules: [rule("onUse", [{ op: "balance", amount: 1 }], [{ op: "hasEntry", who: "target", tag: "x" }])],
        }),
      ).errors,
    ).toEqual(["target_unavailable"]);
    // "any" may name a player, so a target-reaching rule is allowed.
    expect(codes(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "any" } } })).errors).toEqual([]);
  });

  it("parameters must be declared ints where a number is read", () => {
    expect(
      codes(effectDoc({ rules: [rule("afterMovement", [{ op: "steps", delta: { param: "steps" } }])] })).errors,
    ).toEqual(["param_undeclared"]);
    expect(
      codes(
        effectDoc({
          params: { steps: { type: "bool", default: true } },
          rules: [rule("afterMovement", [{ op: "steps", delta: { param: "steps" } }])],
        }),
      ).errors,
    ).toEqual(["param_type"]);
  });

  it("chance_range: a chance is 1–99 %, literal or bounded parameter", () => {
    const withChance = (percent: unknown, params?: EntryDoc["params"]) =>
      effectDoc({ ...(params ? { params } : {}), rules: [rule("afterMovement", [{ op: "steps", delta: 1 }], [{ op: "chance", percent }])] });
    expect(codes(withChance(100)).errors).toEqual(["chance_range"]);
    expect(codes(withChance(0)).errors).toEqual(["chance_range"]);
    expect(codes(withChance(50)).errors).toEqual([]);
    expect(codes(withChance({ param: "p" }, { p: { type: "int", default: 50, min: 0, max: 100 } })).errors).toEqual([
      "chance_range",
    ]);
    expect(codes(withChance({ param: "p" }, { p: { type: "int", default: 50 } })).errors).toEqual(["chance_range"]);
    expect(codes(withChance({ param: "p" }, { p: { type: "int", default: 50, min: 1, max: 99 } })).errors).toEqual([]);
  });

  it("references: missing, wrong kind, and itself", () => {
    expect(
      codes(itemDoc({ rules: [rule("onUse", [{ op: "grantEffect", entry: { entry: IDS.gift }, to: "target" }])] })).errors,
    ).toEqual(["missing_ref"]);
    expect(
      codes(itemDoc({ rules: [rule("onUse", [{ op: "grantEffect", entry: { entry: IDS.salve }, to: "target" }])] })).errors,
    ).toEqual(["ref_kind"]);
    expect(
      codes(itemDoc({ rules: [rule("onUse", [{ op: "grantItem", entry: { entry: IDS.self }, to: "self" }])] })).errors,
    ).toEqual(["grant_cycle"]);
    expect(
      codes(
        effectDoc({
          rules: [rule("afterMovement", [{ op: "steps", delta: 1 }], [{ op: "hasEntry", who: "self", entry: { entry: IDS.gift } }])],
        }),
      ).errors,
    ).toEqual(["missing_ref"]);
    // Checking for itself is fine — it is not a grant.
    expect(
      codes(
        effectDoc({
          rules: [rule("afterMovement", [{ op: "steps", delta: 1 }], [{ op: "hasEntry", who: "self", entry: { entry: IDS.self } }])],
        }),
      ).errors,
    ).toEqual([]);
  });

  it("each kind carries its own fields", () => {
    expect(codes(itemDoc({ usage: undefined })).errors).toContain("usage_required");
    expect(codes(itemDoc({ duration: { unit: "rolls", count: 1 } })).errors).toEqual(["kind_field"]);
    expect(codes(itemDoc({ stacking: { mode: "unique" } })).errors).toEqual(["kind_field"]);
    expect(codes(effectDoc({ duration: undefined })).errors).toEqual(["duration_required"]);
    expect(codes(effectDoc({ usage: { activation: "active", charges: 1 } })).errors).toEqual(["kind_field"]);
    expect(codes(effectDoc({ stacking: { mode: "refresh", maxStacks: 2 } })).errors).toEqual(["kind_field"]);
    expect(codes(effectDoc({ stacking: { mode: "stack", maxStacks: 2 } })).errors).toEqual([]);
  });

  it("durations: counted units need a count, the rest take none", () => {
    expect(codes(effectDoc({ duration: { unit: "rolls" } })).errors).toEqual(["duration_count"]);
    expect(codes(effectDoc({ duration: { unit: "permanent", count: 2 } })).errors).toEqual(["duration_count"]);
    expect(codes(effectDoc({ duration: { unit: "permanent" } })).errors).toEqual([]);
  });

  it("an active item needs charges and a use", () => {
    expect(codes(itemDoc({ usage: { activation: "active", target: { who: "other" } } })).errors).toEqual(["charges_required"]);
    expect(codes(itemDoc({ rules: [] })).errors).toEqual(["no_rules"]);
    expect(codes(effectDoc({ rules: [] })).errors).toEqual(["no_rules"]);
  });
});

describe("checkEntry — cursed and passive items (spec §6.10)", () => {
  const cursed = (over: Partial<EntryDoc> = {}) =>
    itemDoc({
      character: "penalty",
      usage: { activation: "cursed", charges: 1 },
      rules: [rule("afterDice", [{ op: "resultModify", delta: -2 }])],
      ...over,
    });
  const passive = (over: Partial<EntryDoc> = {}) =>
    itemDoc({ usage: { activation: "passive" }, rules: [rule("afterMovement", [{ op: "steps", delta: 1 }])], ...over });

  it("a cursed item with its charges and a passive one without them are sound", () => {
    expect(codes(cursed()).errors).toEqual([]);
    expect(codes(passive()).errors).toEqual([]);
    expect(codes(passive({ usage: { activation: "passive", charges: 3, unique: true } })).errors).toEqual([]);
  });

  it("cursed_character: a cursed item is a penalty, and a penalty item is cursed", () => {
    expect(codes(cursed({ character: "bonus" })).errors).toEqual(["cursed_character"]);
    expect(codes(itemDoc({ character: "penalty" })).errors).toEqual(["cursed_character"]);
  });

  it("an item that is never used has no window and no target; a cursed one needs its charges", () => {
    expect(codes(passive({ usage: { activation: "passive", window: "before_roll" } })).errors).toEqual(["usage_field"]);
    expect(codes(cursed({ usage: { activation: "cursed", charges: 1, target: { who: "other" } } })).errors).toEqual(["usage_field"]);
    expect(codes(cursed({ usage: { activation: "cursed" } })).errors).toEqual(["charges_required"]);
  });

  it("a target filter needs an item aimed at a player", () => {
    expect(codes(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "other", filter: "ahead" } } })).errors).toEqual([]);
    expect(codes(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "self", filter: "ahead" } } })).errors).toContain(
      "usage_field",
    );
  });

  it("works at the turn hooks while held and as it arrives — never when used", () => {
    expect(codes(cursed({ rules: [rule("onUse", [{ op: "balance", amount: -1 }])] })).errors).toEqual([
      "trigger_kind",
      "held_rule_required",
    ]);
    // Only a pickup rule: nothing to do while held.
    expect(codes(passive({ rules: [rule("onPickup", [{ op: "balance", amount: 1 }])] })).errors).toEqual(["held_rule_required"]);
    expect(codes(passive({ rules: [rule("onPickup", [{ op: "balance", amount: 1 }]), rule("onTick", [{ op: "balance", amount: 1 }])] })).errors).toEqual([]);
    // An active item may act as it is picked up too.
    expect(codes(itemDoc({ rules: [...itemDoc().rules, rule("onPickup", [{ op: "balance", amount: 1 }])] })).errors).toEqual([]);
  });

  it("a choice is the user's, at use, once per item", () => {
    const remove = (pick: string) => ({ op: "remove", what: "any", character: "penalty", pick });
    const amulet = (rules: RuleDoc[]) => itemDoc({ usage: { activation: "active", charges: 1, target: { who: "self" } }, rules });
    expect(codes(amulet([rule("onUse", [remove("choice")])])).errors).toEqual([]);
    expect(codes(amulet([rule("onUse", [remove("choice"), remove("choice")])])).errors).toEqual(["choice_twice"]);
    expect(codes(effectDoc({ rules: [rule("onApply", [remove("choice")])] })).errors).toEqual(["choice_place"]);
    expect(codes(effectDoc({ rules: [rule("onApply", [remove("newest")])] })).errors).toEqual([]);
    // A choice is of the user's own, one at a time — the shape says so.
    expect(codes(amulet([rule("onUse", [{ ...remove("choice"), count: 2 }])])).errors).toEqual(["schema"]);
  });
});

describe("checkEntry — item operations (wave B, spec §6.12)", () => {
  const aimed = (rules: RuleDoc[]) => itemDoc({ usage: { activation: "active", charges: 1, target: { who: "other" } }, rules });
  const own = (rules: RuleDoc[]) => itemDoc({ usage: { activation: "active", charges: 1, target: { who: "self" } }, rules });

  it("takes, trades and copies only from a chosen player", () => {
    for (const op of ["stealItem", "swapItems", "copyItem"]) {
      expect(codes(aimed([rule("onUse", [{ op }])])).errors).toEqual([]);
      expect(codes(own([rule("onUse", [{ op }])])).errors).toEqual(["target_unavailable"]);
    }
    expect(codes(effectDoc({ rules: [rule("onApply", [{ op: "stealItem" }])] })).errors).toEqual(["action_trigger", "target_unavailable"]);
  });

  it("gives to a random rival anywhere it may, to the chosen player only at an aimed use", () => {
    expect(codes(effectDoc({ rules: [rule("onApply", [{ op: "transferItem", to: "randomRival" }])] })).errors).toEqual([]);
    expect(codes(effectDoc({ rules: [rule("onApply", [{ op: "transferItem", to: "target" }])] })).errors).toEqual(["target_unavailable"]);
    expect(codes(aimed([rule("onUse", [{ op: "transferItem", to: "target" }])])).errors).toEqual([]);
    expect(codes(effectDoc({ rules: [rule("afterMovement", [{ op: "transferItem", to: "randomRival" }])] })).errors).toEqual(["action_trigger"]);
  });

  it("a pick from the catalog is the user's, at use, once per item", () => {
    expect(codes(own([rule("onUse", [{ op: "grantChosen", rarity: ["common"] }])])).errors).toEqual([]);
    expect(codes(own([rule("onUse", [{ op: "grantChosen" }, { op: "grantChosen" }])])).errors).toEqual(["entry_choice_twice"]);
    expect(codes(effectDoc({ rules: [rule("onApply", [{ op: "grantChosen" }])] })).errors).toEqual(["action_trigger"]);
    // «Философский камень»: one pick of the user's own and one of the catalog, in one rule.
    const stone = rule("onUse", [
      { op: "remove", what: "item", character: "bonus", rarity: ["common"], pick: "choice" },
      { op: "grantChosen", rarity: ["common"] },
    ]);
    expect(codes(own([stone])).errors).toEqual([]);
  });

  it("spins a wheel again at the end of the move or of the game only", () => {
    expect(codes(effectDoc({ rules: [rule("afterCellEffect", [{ op: "extraSpin", pool: "bonus" }])] })).errors).toEqual([]);
    expect(codes(effectDoc({ rules: [rule("onOutcome", [{ op: "extraSpin", pool: "penalty" }])] })).errors).toEqual([]);
    expect(codes(effectDoc({ rules: [rule("afterMovement", [{ op: "extraSpin", pool: "bonus" }])] })).errors).toEqual(["action_trigger"]);
  });

  it("a scenario's pick from the catalog names an entry that is there", () => {
    const ghost = { entry: "99999999-9999-4999-8999-999999999999", slug: "ghost" };
    const joker = own([rule("onUse", [{ op: "grantChosen" }])]);
    const r = checkEntry(
      { ...joker, scenarios: [{ title: { ru: "Выбор" }, steps: [{ do: "use", chooseEntry: ghost, expect: { result: "used" } }] }] },
      ctx,
    );
    expect(r.errors.map((e) => [e.code, e.path.join(".")])).toEqual([["missing_ref", "scenarios.0.steps.0.chooseEntry"]]);
  });
});

describe("checkEntry — what arrives, and protection (wave B, spec §6.13)", () => {
  const passive = (rules: RuleDoc[], over: Partial<EntryDoc> = {}) => itemDoc({ usage: { activation: "passive", charges: 1 }, rules, ...over });
  const harm = [{ op: "incoming", is: "harm" }];

  it("a shield, a mirror, a phoenix — what works while held may answer what arrives", () => {
    expect(codes(passive([rule("onIncoming", [{ op: "block" }], harm)])).errors).toEqual([]);
    expect(codes(passive([rule("onIncoming", [{ op: "reflect" }], harm)], { rarity: "rare", protection: { tier: 2 } }))).toEqual({ errors: [], warnings: [] });
    expect(codes(passive([rule("onIncoming", [{ op: "replace", with: 1 }], [{ op: "incoming", is: "moveBack" }])])).errors).toEqual([]);
    // An active item acts when used: it answers nothing.
    expect(codes(itemDoc({ rules: [rule("onIncoming", [{ op: "block" }], harm)] })).errors).toEqual(["trigger_kind", "on_use_required"]);
  });

  it("an effect answers, or holds a standing state while it lasts", () => {
    expect(codes(effectDoc({ rules: [rule("onIncoming", [{ op: "amplify", factor: 2 }], [{ op: "incoming", is: "entry", character: "penalty" }])] })).errors).toEqual([]);
    expect(codes(effectDoc({ rules: [rule("whileActive", [{ op: "untargetable" }, { op: "pierce", value: 1 }])] })).errors).toEqual([]);
    // A standing state is asked any time: no chance to it, and no answer either.
    expect(codes(effectDoc({ rules: [rule("whileActive", [{ op: "forbidItems" }], [{ op: "chance", percent: 50 }])] })).errors).toEqual(["condition_trigger"]);
    expect(codes(effectDoc({ rules: [rule("whileActive", [{ op: "block" }])] })).errors).toEqual(["action_trigger"]);
    expect(codes(effectDoc({ rules: [rule("onIncoming", [{ op: "untargetable" }])] })).errors).toEqual(["action_trigger"]);
    // An instant effect keeps nothing to answer with.
    expect(codes(effectDoc({ duration: { unit: "instant" }, rules: [rule("onIncoming", [{ op: "block" }])] })).errors).toEqual(["trigger_kind"]);
  });

  it("incoming_twice: a rule answers one way", () => {
    expect(codes(effectDoc({ rules: [rule("onIncoming", [{ op: "block" }, { op: "replace", with: 1 }], harm)] })).errors).toEqual(["incoming_twice"]);
    expect(codes(effectDoc({ rules: [rule("onIncoming", [{ op: "block" }], harm), rule("onIncoming", [{ op: "replace", with: 1 }], harm)] })).errors).toEqual([]);
  });

  it("reflect_scope: only a rival's harmful action has someone to turn it back on", () => {
    expect(codes(passive([rule("onIncoming", [{ op: "reflect" }])])).errors).toEqual(["reflect_scope"]);
    expect(codes(passive([rule("onIncoming", [{ op: "reflect" }], [{ op: "incoming", is: "entry" }])])).errors).toEqual(["reflect_scope"]);
    const r = checkEntry(passive([rule("onIncoming", [{ op: "reflect" }])]), ctx);
    expect(r.errors[0]).toMatchObject({ path: ["rules", 0, "do", 0], params: { op: "reflect" } });
  });

  it("protection_unused: a tier with neither a block nor a reflection is a warning", () => {
    expect(codes(effectDoc({ protection: { tier: 2 } })).warnings).toEqual(["protection_unused"]);
    expect(codes(passive([rule("onIncoming", [{ op: "replace", with: 1 }])], { protection: { tier: 1 } })).warnings).toEqual(["protection_unused"]);
  });

  it("an item that works while held may do it by answering or holding — no turn hook needed", () => {
    expect(codes(passive([rule("whileActive", [{ op: "untargetable" }])], { usage: { activation: "passive" } })).errors).toEqual([]);
    expect(codes(passive([rule("onPickup", [{ op: "balance", amount: 1 }])])).errors).toEqual(["held_rule_required"]);
  });
});

describe("checkEntry — the player's choices (wave B, spec §6.14)", () => {
  it("«Налог», «Перегруз», «Проклятие жадности» are sound", () => {
    const tax = effectDoc({
      duration: { unit: "instant" },
      stacking: undefined,
      rules: [
        rule("onApply", [{ op: "victimChoice" }], [{ op: "itemCount", cmp: "gte", value: 1, character: "bonus" }]),
        rule("onApply", [{ op: "move", by: -1 }], [{ op: "itemCount", cmp: "eq", value: 0, character: "bonus" }]),
      ],
    });
    expect(codes(tax).errors).toEqual([]);
    const overload = effectDoc({
      rarity: "rare",
      rules: [rule("onApply", [{ op: "victimChoice", count: 2, orKeep: true }]), rule("afterDice", [{ op: "resultModify", cap: 3 }])],
    });
    expect(codes(overload).errors).toEqual([]);
    const greed = effectDoc({ rarity: "rare", duration: { unit: "next_game" }, rules: [rule("whileActive", [{ op: "holdLimit", max: 1 }])] });
    expect(codes(greed).errors).toEqual([]);
  });

  it("or_keep_instant: an instant effect keeps nothing to be rid of", () => {
    const r = checkEntry(
      effectDoc({ duration: { unit: "instant" }, stacking: undefined, rules: [rule("onApply", [{ op: "victimChoice", orKeep: true }])] }),
      ctx,
    );
    expect(r.errors.map((e) => e.code)).toEqual(["or_keep_instant"]);
    expect(r.errors[0]).toMatchObject({ path: ["rules", 0, "do", 0, "orKeep"], params: { op: "victimChoice" } });
  });

  it("a choice is put where an entry runs by itself, never at a use; a limit stands while it lasts", () => {
    expect(codes(itemDoc({ rules: [rule("onUse", [{ op: "victimChoice" }])] })).errors).toEqual(["action_trigger"]);
    expect(codes(effectDoc({ rules: [rule("onApply", [{ op: "holdLimit", max: 1 }])] })).errors).toEqual(["action_trigger"]);
    // A cursed item may ask as it is picked up.
    const cursed = itemDoc({
      character: "penalty",
      usage: { activation: "cursed", charges: 1 },
      rules: [rule("onPickup", [{ op: "victimChoice", orKeep: true }]), rule("afterMovement", [{ op: "steps", delta: -1 }])],
    });
    expect(codes(cursed).errors).toEqual([]);
  });
});

describe("checkEntry — the next game (wave C, spec §6.16)", () => {
  const picking = (pick: string, over: Partial<NonNullable<EntryDoc["usage"]>> = {}) =>
    itemDoc({
      usage: { activation: "active", charges: 1, target: { who: "self" }, pick: pick as "genre", ...over },
      rules: [rule("onUse", [{ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }])],
    });
  const handout = (rules: RuleDoc[], over: Partial<EntryDoc> = {}) =>
    effectDoc({ character: "bonus", duration: { unit: "next_game" }, rules, ...over });

  it("«Вето жанра», «Выбор эпохи», «Любимчик» and «Старое железо» are sound", () => {
    expect(codes(picking("genre")).errors).toEqual([]);
    expect(codes(picking("years", { window: "before_roll" })).errors).toEqual([]);
    expect(codes(handout([rule("beforeGameRoll", [{ op: "poolExclude", genres: "picked" }])])).errors).toEqual([]);
    expect(codes(handout([rule("beforeGameRoll", [{ op: "poolRequire", years: "picked" }])])).errors).toEqual([]);
    expect(codes(handout([rule("beforeGameRoll", [{ op: "poolFavor", factor: 3 }])])).errors).toEqual([]);
    const old = effectDoc({
      duration: { unit: "next_game" },
      params: { lastYear: { type: "int", default: 2009, min: 1980, max: 2020 } },
      rules: [rule("beforeGameRoll", [{ op: "poolRequire", years: { max: { param: "lastYear" } } }])],
    });
    expect(codes(old)).toEqual({ errors: [], warnings: [] });
    // A held item may narrow its holder's pool by what it says itself.
    const charm = itemDoc({ usage: { activation: "passive" }, rules: [rule("beforeGameRoll", [{ op: "poolExclude", genres: "lastPassed" }])] });
    expect(codes(charm).errors).toEqual([]);
  });

  it("pick_target: a pick is made by the item's user, for their own game, from the inventory", () => {
    const r = checkEntry(picking("genre", { target: { who: "other" } }), ctx);
    expect(r.errors.map((e) => e.code)).toEqual(["pick_target"]);
    expect(r.errors[0]).toMatchObject({ path: ["usage", "pick"], params: { pick: "genre", who: "other" } });
    expect(codes(picking("game", { target: { who: "none" } })).errors).toEqual(["pick_target"]);
  });

  it("pick_unused: the use hands its user an effect that remembers the pick", () => {
    const nowhere = itemDoc({
      usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "genre" },
      rules: [rule("onUse", [{ op: "balance", amount: 1 }])],
    });
    expect(codes(nowhere).errors).toEqual(["pick_unused"]);
    // Handing it to someone else is not remembering it.
    const away = itemDoc({
      usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "genre" },
      rules: [rule("onUse", [{ op: "grantItem", entry: { entry: IDS.salve }, to: "self" }])],
    });
    expect(codes(away).errors).toEqual(["pick_unused"]);
  });

  it("a passive or cursed item asks for no pick, and remembers none", () => {
    const passive = itemDoc({ usage: { activation: "passive", pick: "genre" }, rules: [rule("beforeGameRoll", [{ op: "poolExclude", rating: { max: 2 } }])] });
    expect(codes(passive).errors).toEqual(["usage_field"]);
    const reads = itemDoc({ usage: { activation: "passive" }, rules: [rule("beforeGameRoll", [{ op: "poolRequire", genres: "picked" }])] });
    const r = checkEntry(reads, ctx);
    expect(r.errors.map((e) => e.code)).toEqual(["pick_place"]);
    expect(r.errors[0]).toMatchObject({ path: ["rules", 0, "do", 0], params: { op: "poolRequire" } });
    const favours = itemDoc({ usage: { activation: "passive" }, rules: [rule("beforeGameRoll", [{ op: "poolFavor", factor: 2 }])] });
    expect(codes(favours).errors).toEqual(["pick_place"]);
  });

  it("the next game's rules stand at beforeGameRoll only, and never at an active item's moments", () => {
    expect(codes(handout([rule("onApply", [{ op: "poolExclude", genres: "picked" }])])).errors).toEqual(["action_trigger"]);
    expect(codes(itemDoc({ rules: [rule("beforeGameRoll", [{ op: "poolExclude", genres: "lastPassed" }])] })).errors).toContain("trigger_kind");
    // Nothing about a turn is known when a game is picked.
    expect(codes(handout([rule("beforeGameRoll", [{ op: "poolExclude", genres: "picked" }], [{ op: "outcome", is: "passed" }])])).errors).toEqual([
      "condition_trigger",
    ]);
  });

  it("year_range: a year a parameter sets is bounded to 1970–2100", () => {
    const unbounded = effectDoc({
      duration: { unit: "next_game" },
      params: { lastYear: { type: "int", default: 2009 } },
      rules: [rule("beforeGameRoll", [{ op: "poolRequire", years: { min: 1990, max: { param: "lastYear" } } }])],
    });
    const r = checkEntry(unbounded, ctx);
    expect(r.errors.map((e) => e.code)).toEqual(["year_range"]);
    expect(r.errors[0]).toMatchObject({ params: { param: "lastYear" } });
    const wide = effectDoc({
      duration: { unit: "next_game" },
      params: { lastYear: { type: "int", default: 2009, min: 1900, max: 2020 } },
      rules: [rule("beforeGameRoll", [{ op: "poolRequire", years: { max: { param: "lastYear" } } }])],
    });
    expect(codes(wide).errors).toEqual(["year_range"]);
  });

  it("«Второй шанс» and «Три двери» hand out a choice; a held item may ask for one too", () => {
    expect(codes(handout([rule("beforeGameRoll", [{ op: "chooseOfN", n: 2 }])])).errors).toEqual([]);
    const charm = itemDoc({ usage: { activation: "passive" }, rules: [rule("beforeGameRoll", [{ op: "chooseOfN", n: 3 }])] });
    expect(codes(charm).errors).toEqual([]);
    expect(codes(handout([rule("onApply", [{ op: "chooseOfN", n: 2 }])])).errors).toEqual(["action_trigger"]);
  });

  it("open_roll_only: «Переролл игры» and «Отложенная игра» are used on an open roll", () => {
    const onOpenRoll = (op: RuleDoc["do"][number], window: "on_open_roll" | "anytime" | "before_roll" = "on_open_roll") =>
      itemDoc({ usage: { activation: "active", window, target: { who: "self" }, charges: 1 }, rules: [rule("onUse", [op])] });
    expect(codes(onOpenRoll({ op: "rerollGame" })).errors).toEqual([]);
    expect(codes(onOpenRoll({ op: "postponeGame", afterRolls: 2 })).errors).toEqual([]);
    const anytime = checkEntry(onOpenRoll({ op: "rerollGame" }, "anytime"), ctx);
    expect(anytime.errors.map((e) => e.code)).toEqual(["open_roll_only"]);
    expect(anytime.errors[0]).toMatchObject({ path: ["rules", 0, "do", 0], params: { op: "rerollGame" } });
    expect(codes(onOpenRoll({ op: "postponeGame" }, "before_roll")).errors).toEqual(["open_roll_only"]);
    // Nowhere but a use: an effect has no game in flight to act on.
    expect(codes(handout([rule("onApply", [{ op: "rerollGame" }])])).errors).toEqual(["action_trigger"]);
  });

  it("condition_tag: a condition is added where a game is assigned, by an entry the season can switch off by its tag (spec §6.17)", () => {
    const hard = { op: "addCondition", text: { ru: "На высокой сложности" } } as const;
    const tagged = (rules: RuleDoc[], tags = ["game_condition"]) => effectDoc({ duration: { unit: "next_game" }, tags, rules });
    expect(codes(tagged([rule("onRollCreated", [hard])])).errors).toEqual([]);
    const untagged = checkEntry(tagged([rule("onRollCreated", [hard])], []), ctx);
    expect(untagged.errors.map((e) => e.code)).toEqual(["condition_tag"]);
    expect(untagged.errors[0]).toMatchObject({ path: ["tags"], params: { tag: "game_condition" } });
    expect(codes(tagged([rule("onApply", [hard])])).errors).toEqual(["action_trigger"]);
    // A cursed item held may add one; an active item has no such moment.
    const cursed = itemDoc({ character: "penalty", tags: ["game_condition"], usage: { activation: "cursed", charges: 1 }, rules: [rule("onRollCreated", [hard])] });
    expect(codes(cursed).errors).toEqual([]);
    expect(codes(itemDoc({ tags: ["game_condition"], rules: [rule("onUse", [{ op: "balance", amount: 1 }]), rule("onRollCreated", [hard])] })).errors).toEqual([
      "trigger_kind",
    ]);
    // Immunity holds while it lasts, and needs no tag.
    expect(codes(effectDoc({ character: "bonus", duration: { unit: "rolls", count: 2 }, rules: [rule("whileActive", [{ op: "conditionImmunity" }])] })).errors).toEqual([]);
  });
});

describe("checkEntry — objects on the board (wave D, spec §6.18)", () => {
  const placing = (rules: RuleDoc[], over: Partial<NonNullable<EntryDoc["usage"]>> = {}) =>
    itemDoc({ usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "cell", ...over }, rules });
  const placed = rule("onUse", [{ op: "placeObject" }]);

  it("«Мина», «Пружина» and «Капкан» are sound", () => {
    expect(codes(placing([placed, rule("onObjectEntered", [{ op: "stopMove" }])]))).toEqual({ errors: [], warnings: [] });
    expect(codes(placing([placed, rule("onObjectEntered", [{ op: "extend", delta: 2 }])]))).toEqual({ errors: [], warnings: [] });
    const snare = placing([placed, rule("onObjectEntered", [{ op: "stopMove" }, { op: "push", delta: -2 }, { op: "spinInstead", pool: "penalty" }])]);
    expect(codes(snare)).toEqual({ errors: [], warnings: [] });
    // What it checks is the mover's: a mine that stops only whoever carries a status of a tag.
    const picky = placing([placed, rule("onObjectEntered", [{ op: "stopMove" }], [{ op: "hasEntry", who: "self", tag: "movement" }])]);
    expect(codes(picky).errors).toEqual([]);
  });

  it("place_pick: an item that places itself asks for the cell, and only such an item asks for one", () => {
    const unpicked = checkEntry(placing([placed, rule("onObjectEntered", [{ op: "stopMove" }])], { pick: undefined }), ctx);
    expect(unpicked.errors.map((e) => e.code)).toEqual(["place_pick"]);
    expect(unpicked.errors[0]).toMatchObject({ path: ["usage", "pick"], params: { pick: "" } });
    const cellOnly = checkEntry(placing([rule("onUse", [{ op: "balance", amount: 1 }])]), ctx);
    expect(cellOnly.errors.map((e) => e.code)).toEqual(["place_pick"]);
    expect(cellOnly.errors[0]).toMatchObject({ params: { pick: "cell" } });
    // A cell is not remembered by an effect: nothing else asks for one.
    expect(codes(placing([placed, rule("onObjectEntered", [{ op: "stopMove" }])])).errors).not.toContain("pick_unused");
    // An object is placed by its user, from the inventory.
    expect(codes(placing([placed, rule("onObjectEntered", [{ op: "stopMove" }])], { target: { who: "other" } })).errors).toEqual(["pick_target"]);
  });

  it("object_unplaced: rules for a move entering its cell need the item on the board", () => {
    const r = checkEntry(itemDoc({ usage: { activation: "active", charges: 1, target: { who: "self" } }, rules: [rule("onUse", [{ op: "balance", amount: 1 }]), rule("onObjectEntered", [{ op: "stopMove" }])] }), ctx);
    expect(r.errors.map((e) => e.code)).toEqual(["object_unplaced"]);
    expect(r.errors[0]).toMatchObject({ path: ["rules"] });
    // A held item never stands on the board: the moment is not its.
    const held = itemDoc({ usage: { activation: "passive" }, rules: [rule("onObjectEntered", [{ op: "stopMove" }])] });
    expect(codes(held).errors).toEqual(["trigger_kind", "held_rule_required"]);
    // Nor an effect's.
    expect(codes(effectDoc({ rules: [rule("onObjectEntered", [{ op: "stopMove" }])] })).errors).toEqual(["trigger_kind"]);
  });

  it("object_stop: a push and a wheel follow a stop; a stopped move goes no further", () => {
    const push = checkEntry(placing([placed, rule("onObjectEntered", [{ op: "push", delta: -2 }])]), ctx);
    expect(push.errors.map((e) => e.code)).toEqual(["object_stop"]);
    expect(push.errors[0]).toMatchObject({ path: ["rules", 1, "do", 0], params: { op: "push" } });
    expect(codes(placing([placed, rule("onObjectEntered", [{ op: "spinInstead", pool: "bonus" }])])).errors).toEqual(["object_stop"]);
    const both = checkEntry(placing([placed, rule("onObjectEntered", [{ op: "stopMove" }, { op: "extend", delta: 2 }])]), ctx);
    expect(both.errors.map((e) => e.code)).toEqual(["object_stop"]);
    expect(both.errors[0]).toMatchObject({ path: ["rules", 1, "do", 1], params: { op: "extend" } });
  });

  it("object_idle warns of an object that does nothing; the moves it acts on stand nowhere else", () => {
    expect(codes(placing([placed]))).toEqual({ errors: [], warnings: ["object_idle"] });
    expect(codes(placing([placed, rule("afterMovement", [{ op: "stopMove" }])])).errors).toContain("trigger_kind");
    expect(codes(effectDoc({ rules: [rule("afterMovement", [{ op: "extend", delta: 1 }])] })).errors).toEqual(["action_trigger"]);
    expect(codes(effectDoc({ rules: [rule("onApply", [{ op: "placeObject" }])] })).errors).toEqual(["action_trigger"]);
  });
});

describe("checkEntry — the same cell (wave D, spec §6.19)", () => {
  const crown = (over: Partial<EntryDoc> = {}) =>
    itemDoc({
      rarity: "epic",
      usage: { activation: "passive", unique: "season" },
      rules: [rule("afterDice", [{ op: "resultModify", delta: 1 }], [{ op: "outcome", is: "passed" }]), rule("onSameCell", [{ op: "takeEntry" }])],
      ...over,
    });

  it("«Корона» is sound: held, one in the season, taken by the rival who arrives", () => {
    expect(codes(crown())).toEqual({ errors: [], warnings: [] });
    // An effect answers a rival arriving as well — with what it may do anywhere.
    expect(codes(effectDoc({ character: "bonus", rules: [rule("onSameCell", [{ op: "balance", amount: 1 }])] })).errors).toEqual([]);
  });

  it("take_item: only an item changes hands", () => {
    const r = checkEntry(effectDoc({ rules: [rule("onSameCell", [{ op: "takeEntry" }])] }), ctx);
    expect(r.errors.map((e) => e.code)).toEqual(["take_item"]);
    expect(r.errors[0]).toMatchObject({ path: ["rules", 0, "do", 0], params: { op: "takeEntry" } });
  });

  it("an active item has no such moment; taking stands nowhere else", () => {
    expect(codes(itemDoc({ rules: [rule("onUse", [{ op: "balance", amount: 1 }]), rule("onSameCell", [{ op: "takeEntry" }])] })).errors).toEqual(["trigger_kind"]);
    expect(codes(crown({ rules: [rule("afterMovement", [{ op: "takeEntry" }])] })).errors).toEqual(["action_trigger"]);
  });
});

describe("checkEntry — warnings", () => {
  it("a missing translation falls back to ru with a warning per language", () => {
    expect(codes(effectDoc({ name: { ru: "Тест" } })).warnings).toEqual(["name_fallback", "name_fallback"]);
  });

  it("extreme values are flagged, not refused", () => {
    // Legendary, so their power is not what is being flagged.
    const strong = (rules: EntryDoc["rules"]) => effectDoc({ rarity: "legendary", rules });
    expect(codes(strong([rule("afterMovement", [{ op: "steps", delta: 9 }])])).warnings).toEqual(["extreme_value"]);
    expect(codes(strong([rule("beforeMovement", [{ op: "dice", sides: 8, count: 3 }])])).warnings).toEqual([
      "extreme_value",
      "extreme_value",
    ]);
    expect(codes(strong([rule("afterCellEffect", [{ op: "balance", amount: -20 }])])).warnings).toEqual(["extreme_value"]);
    expect(codes(strong([rule("afterDice", [{ op: "resultModify", delta: -8 }])])).warnings).toEqual(["extreme_value"]);
    expect(codes(strong([rule("afterDice", [{ op: "resultModify", cap: 2 }])])).warnings).toEqual([]);
  });

  it("more power than the rarity carries is a warning at the rarity", () => {
    // Two cells for two rolls: 4 — more than a common entry's 2.5, within a rare one's.
    const doc = effectDoc({ rules: [rule("afterMovement", [{ op: "steps", delta: 2 }])] });
    const r = checkEntry(doc, ctx);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toMatchObject([{ code: "power_above_rarity", path: ["rarity"], params: { power: "4.0", rarity: "common", suggested: "rare" } }]);
    expect(codes({ ...doc, rarity: "rare" }).warnings).toEqual([]);
    // A grant is worth what it hands out, when the context knows.
    const item = itemDoc();
    expect(codes(item).warnings).toEqual([]);
    expect(checkEntry(item, { ...ctx, powerOf: () => 7 }).warnings).toMatchObject([
      { code: "power_above_rarity", params: { power: "7.0", suggested: "legendary" } },
    ]);
  });

  it("an unused parameter is mentioned", () => {
    expect(codes(effectDoc({ params: { spare: { type: "int", default: 1 } } })).warnings).toEqual(["param_unused"]);
  });
});

describe("checkEntry — scenarios, before they run", () => {
  const roll = { do: "roll", outcome: "passed", dice: 4 } as const;
  const title = { ru: "Проверка" };

  it("a scenario is a document of its own shape", () => {
    const r = checkEntry(effectDoc({ scenarios: [{ given: "x" }] as never }), ctx);
    expect(r.doc).toBeNull();
    expect(r.errors.every((e) => e.code === "schema" && e.path[0] === "scenarios")).toBe(true);
    expect(codes(effectDoc({ scenarios: [{ title, steps: [] }] as never })).errors).toEqual(["schema"]);
  });

  it("a sound scenario passes and changes nothing else", () => {
    const scenario = {
      id: "SC-TEST-1",
      title,
      given: { holder: { carries: [{ entry: "self" as const }, { entry: { entry: IDS.tailwind } }] } },
      steps: [{ ...roll, expect: { moved: 4, holder: [{ entry: "self" as const, count: 1 }] } }],
    };
    expect(codes(effectDoc({ scenarios: [scenario] }))).toEqual({ errors: [], warnings: [] });
  });

  it("every entry it names must be available", () => {
    const ghost = { entry: "99999999-9999-4999-8999-999999999999", slug: "ghost" };
    const r = checkEntry(
      effectDoc({
        scenarios: [
          {
            title,
            given: { rival: { carries: [{ entry: ghost }] } },
            steps: [{ do: "grant", entry: ghost }, { ...roll, expect: { rival: [{ entry: ghost, count: 0 }] } }],
          },
        ],
      }),
      ctx,
    );
    expect(r.errors.map((e) => [e.code, e.path.join(".")])).toEqual([
      ["missing_ref", "scenarios.0.given.rival.carries.0.entry"],
      ["missing_ref", "scenarios.0.steps.0.entry"],
      ["missing_ref", "scenarios.0.steps.1.expect.rival.0.entry"],
    ]);
    expect(r.errors[0]!.params).toEqual({ entry: "ghost" });
  });

  it("a use step uses an item: the entry itself, or the one it names", () => {
    expect(codes(itemDoc({ scenarios: [{ title, steps: [{ do: "use", on: "nobody" }] }] })).errors).toEqual([]);
    expect(codes(effectDoc({ scenarios: [{ title, steps: [{ do: "use" }] }] })).errors).toEqual(["scenario_item"]);
    const salve = { entry: IDS.salve, slug: "cleansing_salve" };
    expect(codes(effectDoc({ scenarios: [{ title, steps: [{ do: "use", item: salve }] }] })).errors).toEqual([]);
    const tailwind = { entry: IDS.tailwind, slug: "tailwind" };
    const r = checkEntry(effectDoc({ scenarios: [{ title, steps: [{ do: "use", item: tailwind }] }] }), ctx);
    expect(r.errors).toMatchObject([{ code: "scenario_item", path: ["scenarios", 0, "steps", 0, "item"], params: { entry: "tailwind" } }]);
  });

  it("scenario ids are unique within the entry", () => {
    const twice = [
      { id: "SC-A-1", title, steps: [roll] },
      { id: "SC-A-1", title, steps: [roll] },
    ];
    expect(codes(effectDoc({ scenarios: twice })).errors).toEqual(["scenario_id_taken"]);
  });

  it("a scenario that checks nothing proves nothing — a warning, not a refusal", () => {
    const r = checkEntry(effectDoc({ scenarios: [{ title, steps: [{ do: "roll", outcome: "passed", dice: 3 }, { ...roll, expect: {} }] }] }), ctx);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toMatchObject([{ code: "scenario_unchecked", path: ["scenarios", 0], params: { scenario: "1" } }]);
    expect(codes(effectDoc({ scenarios: [{ title, steps: [roll, { ...roll, expect: { moved: 4 } }] }] })).warnings).not.toContain(
      "scenario_unchecked",
    );
  });

  it("a season's registry leaves the scenarios alone", () => {
    const ghost = { entry: "99999999-9999-4999-8999-999999999999", slug: "ghost" };
    const doc = effectDoc({ scenarios: [{ title, steps: [{ do: "grant", entry: ghost }] }] });
    expect(checkEntry(doc, { ...ctx, scenarios: false }).errors).toEqual([]);
  });
});

describe("checkEntrySet — across entries", () => {
  const member = (entryId: string, doc: EntryDoc) => ({ entryId, doc });
  const grant = (entry: string) => rule("onApply", [{ op: "grantEffect", entry: { entry }, to: "self" }]);

  it("finds grant loops of any length and reports each once", () => {
    const a = member(IDS.slowed, effectDoc({ slug: "a", rules: [grant(IDS.tailwind)] }));
    const b = member(IDS.tailwind, effectDoc({ slug: "b", rules: [grant(IDS.gift)] }));
    const c = member(IDS.gift, effectDoc({ slug: "c", rules: [grant(IDS.slowed)] }));
    const { errors } = checkEntrySet([a, b, c]);
    expect(errors.map((e) => [e.code, e.path[0]])).toEqual([
      ["grant_cycle", "a"],
      ["grant_cycle", "b"],
      ["grant_cycle", "c"],
    ]);
    expect(errors[0]!.message).toContain("a → b → c → a");
  });

  it("a chain without a loop is fine", () => {
    const a = member(IDS.slowed, effectDoc({ slug: "a", rules: [grant(IDS.tailwind)] }));
    const b = member(IDS.tailwind, effectDoc({ slug: "b" }));
    expect(checkEntrySet([a, b]).errors).toEqual([]);
  });

  it("duplicate ids and slugs are errors", () => {
    const e = effectDoc();
    expect(checkEntrySet([member(IDS.slowed, e), member(IDS.slowed, e)]).errors.map((x) => x.code)).toContain("duplicate_id");
    expect(
      checkEntrySet([member(IDS.slowed, e), member(IDS.tailwind, { ...e, rules: [rule("afterMovement", [{ op: "steps", delta: 2 }])] })])
        .errors.map((x) => x.code),
    ).toEqual(["duplicate_slug"]);
  });

  it("warns about a penalty effect nothing removes, and stops once something does", () => {
    const curse = member(IDS.slowed, effectDoc({ slug: "curse", tags: ["dice"] }));
    expect(checkEntrySet([curse]).warnings.map((w) => w.code)).toEqual(["no_counter"]);
    const wrongTag = member(
      IDS.salve,
      itemDoc({ slug: "salve", rules: [rule("onUse", [{ op: "cleanse", tags: ["movement"], count: "all" }])], usage: { activation: "active", charges: 1 } }),
    );
    expect(checkEntrySet([curse, wrongTag]).warnings.map((w) => w.code)).toEqual(["no_counter"]);
    const salve = member(
      IDS.salve,
      itemDoc({ slug: "salve", rules: [rule("onUse", [{ op: "cleanse", character: "penalty", count: "all" }])], usage: { activation: "active", charges: 1 } }),
    );
    expect(checkEntrySet([curse, salve]).warnings).toEqual([]);
  });

  it("warns about two entries that behave identically", () => {
    const a = member(IDS.slowed, effectDoc({ slug: "a", character: "bonus" }));
    const b = member(IDS.tailwind, effectDoc({ slug: "b", character: "bonus", name: { ru: "Другое" } }));
    expect(checkEntrySet([a, b]).warnings.map((w) => w.code)).toEqual(["duplicate_behaviour"]);
  });

  it("grantsOf lists what an entry hands out", () => {
    expect(grantsOf(itemDoc())).toEqual([IDS.slowed]);
    expect(grantsOf(effectDoc())).toEqual([]);
  });
});

describe("checkEntry — reaction items (wave B, spec §6.15)", () => {
  const reaction = (rules: RuleDoc[], usage: Record<string, unknown> = {}) =>
    itemDoc({ usage: { activation: "active", window: "after_dice", charges: 1, ...usage }, rules } as Partial<EntryDoc>);

  it("a throw again, the better of two, rerolled faces or a changed result: each a reaction of its own", () => {
    for (const act of [{ op: "reroll" }, { op: "bestOfTwo" }, { op: "rerollOn", values: [1] }, { op: "resultModify", delta: 1 }]) {
      expect(codes(reaction([rule("onUse", [act])])).errors).toEqual([]);
    }
  });

  it("its use sees the dice as `afterDice` does", () => {
    const onOne = [{ op: "diceShow", of: "any", cmp: "eq", value: 1 }];
    expect(codes(reaction([rule("onUse", [{ op: "rerollOn", values: [1] }], onOne)])).errors).toEqual([]);
    expect(codes(reaction([rule("onUse", [{ op: "resultModify", delta: { source: "diceSum" } }])])).errors).toEqual([]);
    // An item used from the inventory has no dice to look at.
    expect(codes(itemDoc({ rules: [rule("onUse", [{ op: "balance", amount: 1 }], onOne)] })).errors).toEqual(["condition_trigger"]);
  });

  it("acts on its holder's own throw: aimed at anyone else, `reaction_target`", () => {
    expect(codes(reaction([rule("onUse", [{ op: "reroll" }])], { target: { who: "other" } })).errors).toEqual(["reaction_target"]);
    expect(codes(reaction([rule("onUse", [{ op: "reroll" }])], { target: { who: "self" } })).errors).toEqual([]);
  });

  it("its use acts on the dice only: `reaction_action`", () => {
    expect(codes(reaction([rule("onUse", [{ op: "steps", delta: 1 }])])).errors).toEqual(["reaction_action"]);
    expect(codes(reaction([rule("onUse", [{ op: "worstOfTwo" }])])).errors).toEqual(["reaction_action"]);
  });

  it("throws again one way: `reaction_throws`, across its rules", () => {
    expect(codes(reaction([rule("onUse", [{ op: "reroll" }, { op: "bestOfTwo" }])])).errors).toEqual(["reaction_throws"]);
    expect(codes(reaction([rule("onUse", [{ op: "reroll" }]), rule("onUse", [{ op: "rerollOn", values: [1] }])])).errors).toEqual(["reaction_throws"]);
    // A throw again and a result change together are one reaction.
    expect(codes(reaction([rule("onUse", [{ op: "reroll" }, { op: "resultModify", delta: 1 }])])).errors).toEqual([]);
  });

  it("a throw again stands nowhere else: `reaction_only`", () => {
    expect(codes(effectDoc({ rules: [rule("afterDice", [{ op: "reroll" }])] })).errors).toEqual(["reaction_only"]);
    expect(codes(itemDoc({ rules: [rule("onUse", [{ op: "reroll" }])] })).errors).toEqual(["reaction_only"]);
  });
});
