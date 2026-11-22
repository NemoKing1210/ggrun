import { describe, expect, it } from "vitest";

import type { Locale } from "./doc";
import { ANY_PLAY, CELL_SHARE, PLAY_MODEL, heldItemWorth, meanRoll, type PlayContext } from "./play-model";
import { FACTS, IDS, ctx, player, resolve, rngOf } from "./fixtures.test-helpers";
import { emptyRuleOutput, type RuleContext } from "./runtime";
import {
  ACTIONS,
  CONDITIONS,
  TRIGGERS,
  actionDef,
  cellList,
  conditionDef,
  isActionOp,
  isConditionOp,
  isTriggerName,
  type ActionDoc,
  type ConditionDoc,
  type RunEnv,
  type StaticEnv,
  type TextEnv,
} from "./vocabulary";

const decls = {
  steps: { type: "int" as const, default: -1, min: -6, max: -1 },
  pct: { type: "int" as const, default: 30, min: 1, max: 99 },
};

const run = (over: Partial<RunEnv> = {}): RunEnv => ({
  params: { steps: -1, pct: 30 },
  decls,
  resolve: (ref) => resolve(ref.entry),
  entry: { slug: "test_entry", kind: "effect" },
  ...over,
});

const staticEnv = (over: Partial<StaticEnv> = {}): StaticEnv => ({
  params: { steps: -1, pct: 30 },
  decls,
  resolve: (ref) => resolve(ref.entry),
  ...over,
});

const text = (locale: Locale, over: Partial<StaticEnv> = {}): TextEnv => ({ ...staticEnv(over), locale });

function evaluate(c: ConditionDoc, context: RuleContext, env = run()): boolean {
  return conditionDef(c).evaluate(c, context, env);
}

function apply(a: ActionDoc, context: RuleContext, env = run()) {
  const out = emptyRuleOutput();
  actionDef(a).apply(a, context, env, out);
  return out;
}

function say(item: ConditionDoc | ActionDoc, over: Partial<StaticEnv> = {}): Record<Locale, string> {
  const def = isConditionOp(item.op)
    ? conditionDef(item as ConditionDoc).text
    : actionDef(item as ActionDoc).text;
  const t = def as Record<Locale, (p: typeof item, env: TextEnv) => string>;
  return { en: t.en(item, text("en", over)), ru: t.ru(item, text("ru", over)), uk: t.uk(item, text("uk", over)) };
}

describe("vocabulary — the tables are consistent", () => {
  it("every trigger, condition and action is of a stage this build carries (1, waves A, B, C and D)", () => {
    const carried = [1, "A", "B", "C", "D"];
    for (const t of Object.values(TRIGGERS)) expect(carried).toContain(t.stage);
    for (const c of Object.values(CONDITIONS)) expect(carried).toContain(c.stage);
    for (const a of Object.values(ACTIONS)) expect(carried).toContain(a.stage);
  });

  it("every primitive is filed under its own op", () => {
    for (const [op, def] of Object.entries(CONDITIONS)) expect(def.op).toBe(op);
    for (const [op, def] of Object.entries(ACTIONS)) expect(def.op).toBe(op);
    for (const [name, def] of Object.entries(TRIGGERS)) expect(def.name).toBe(name);
  });

  it("only real names are recognised", () => {
    expect(isTriggerName("onUse")).toBe(true);
    expect(isTriggerName("toString")).toBe(false);
    expect(isConditionOp("chance")).toBe(true);
    expect(isConditionOp("constructor")).toBe(false);
    expect(isActionOp("steps")).toBe(true);
    expect(isActionOp("teleport")).toBe(false);
  });

  it("turn triggers map to the hooks the loop dispatches; the rest run in the executor", () => {
    expect(TRIGGERS.onUse.hook).toBeNull();
    expect(TRIGGERS.onApply.hook).toBeNull();
    expect(TRIGGERS.onExpire.hook).toBeNull();
    expect(TRIGGERS.afterMovement.hook).toBe("afterMovement");
    expect(TRIGGERS.onTick.hook).toBe("onTick");
  });
});

describe("conditions", () => {
  it("outcome reads the turn's result and is false outside a turn", () => {
    const c: ConditionDoc = { op: "outcome", is: "passed" };
    expect(evaluate(c, ctx())).toBe(true);
    expect(evaluate(c, ctx({ turn: { rollSeq: 1, outcome: "dropped" } }))).toBe(false);
    expect(evaluate(c, ctx({ turn: null }))).toBe(false);
  });

  it("cellType matches any of the listed types", () => {
    const c: ConditionDoc = { op: "cellType", in: ["penalty", "event"] };
    expect(evaluate(c, ctx({ turn: { rollSeq: 1, cellType: "event" } }))).toBe(true);
    expect(evaluate(c, ctx({ turn: { rollSeq: 1, cellType: "bonus" } }))).toBe(false);
    expect(evaluate(c, ctx({ turn: { rollSeq: 1 } }))).toBe(false);
  });

  it("chance draws from the injected rng against the percentage", () => {
    const c: ConditionDoc = { op: "chance", percent: 30 };
    expect(evaluate(c, ctx({ rng: rngOf(0.29) }))).toBe(true);
    expect(evaluate(c, ctx({ rng: rngOf(0.3) }))).toBe(false);
    const p: ConditionDoc = { op: "chance", percent: { param: "pct" } };
    expect(evaluate(p, ctx({ rng: rngOf(0.5) }), run({ params: { pct: 60 } }))).toBe(true);
  });

  it("hasEntry looks at the holder or the target, by entry, tag or character", () => {
    const slowed = FACTS[IDS.slowed]!;
    const byEntry: ConditionDoc = { op: "hasEntry", who: "self", entry: { entry: IDS.slowed } };
    const byTag: ConditionDoc = { op: "hasEntry", who: "target", tag: "movement", character: "penalty" };
    expect(evaluate(byEntry, ctx({ selfEntries: [slowed] }))).toBe(true);
    expect(evaluate(byEntry, ctx({ targetEntries: [slowed] }))).toBe(false);
    expect(evaluate(byTag, ctx({ targetEntries: [slowed] }))).toBe(true);
    expect(evaluate(byTag, ctx({ targetEntries: [FACTS[IDS.tailwind]!] }))).toBe(false);
  });

  it("hasEntry needs something to look for", () => {
    expect(CONDITIONS.hasEntry.schema.safeParse({ op: "hasEntry", who: "self" }).success).toBe(false);
  });

  it("knows which conditions need a chosen player and which parameters they read", () => {
    expect(conditionDef({ op: "hasEntry", who: "target", tag: "x" }).needsTarget({ op: "hasEntry", who: "target", tag: "x" })).toBe(true);
    const chance: ConditionDoc = { op: "chance", percent: { param: "pct" } };
    expect(conditionDef(chance).paramsUsed(chance)).toEqual(["pct"]);
    const has: ConditionDoc = { op: "hasEntry", who: "self", entry: { entry: IDS.slowed } };
    expect(conditionDef(has).refs(has)).toEqual([{ entry: IDS.slowed }]);
  });

  it("estimates how often each holds", () => {
    const env = staticEnv();
    expect(CONDITIONS.outcome.likelihood({ op: "outcome", is: "passed" }, env, ANY_PLAY)).toBeGreaterThan(
      CONDITIONS.outcome.likelihood({ op: "outcome", is: "dropped" }, env, ANY_PLAY),
    );
    expect(CONDITIONS.chance.likelihood({ op: "chance", percent: 25 }, env, ANY_PLAY)).toBe(0.25);
    // As often as a new season's board has those cells.
    expect(CONDITIONS.cellType.likelihood({ op: "cellType", in: ["penalty"] }, env, ANY_PLAY)).toBeCloseTo(CELL_SHARE.penalty);
    expect(CONDITIONS.cellType.likelihood({ op: "cellType", in: ["penalty", "bonus"] }, env, ANY_PLAY)).toBeCloseTo(CELL_SHARE.penalty + CELL_SHARE.bonus);
    expect(CONDITIONS.hasEntry.likelihood({ op: "hasEntry", who: "self", tag: "x" }, env, ANY_PLAY)).toBe(0.5);
  });

  it("speaks three languages", () => {
    expect(say({ op: "outcome", is: "dropped" })).toEqual({
      en: "the game was dropped",
      ru: "игра дропнута",
      uk: "гру дропнуто",
    });
    expect(say({ op: "cellType", in: ["penalty", "event"] })).toEqual({
      en: "the move ended on a penalty cell or an event cell",
      ru: "ход закончился на штрафной клетке или клетке события",
      uk: "хід закінчився на штрафній клітинці або клітинці події",
    });
    expect(say({ op: "chance", percent: { param: "pct" } })).toEqual({
      en: "with a 30% chance",
      ru: "с вероятностью 30%",
      uk: "з імовірністю 30%",
    });
    expect(say({ op: "hasEntry", who: "target", entry: { entry: IDS.slowed } })).toEqual({
      en: "the chosen player has “Slowed”",
      ru: "у выбранного игрока есть «Замедление»",
      uk: "в обраного гравця є «Уповільнення»",
    });
    expect(say({ op: "hasEntry", who: "self", character: "penalty", tag: "movement" })).toEqual({
      en: "you have a penalty item or effect tagged “movement”",
      ru: "у вас есть штрафной предмет или эффект с меткой «movement»",
      uk: "у вас є штрафний предмет або ефект з міткою «movement»",
    });
    expect(say({ op: "hasEntry", who: "self", tag: "dice" }).en).toBe("you have an item or effect tagged “dice”");
  });

  it("prints a reference that does not resolve by its slug", () => {
    const c: ConditionDoc = { op: "hasEntry", who: "self", entry: { entry: IDS.gift, slug: "gift" } };
    expect(say(c).en).toBe("you have “gift”");
    expect(say({ op: "hasEntry", who: "self", entry: { entry: IDS.gift } }).en).toBe(`you have “${IDS.gift}”`);
  });
});

describe("cell names", () => {
  it("cover every cell type in both cases in every language", () => {
    for (const locale of ["en", "ru", "uk"] as const) {
      for (const type of ["start", "finish", "normal", "penalty", "event", "bonus", "teleport", "custom"] as const) {
        expect(cellList(locale, [type], "to").length).toBeGreaterThan(0);
        expect(cellList(locale, [type], "at").length).toBeGreaterThan(0);
      }
    }
  });
});

describe("actions — behaviour", () => {
  it("steps adds signed cells, parameters and random draws included", () => {
    expect(apply({ op: "steps", delta: 2 }, ctx()).stepsDelta).toBe(2);
    expect(apply({ op: "steps", delta: { param: "steps" } }, ctx(), run({ params: { steps: -3 } })).stepsDelta).toBe(-3);
    expect(apply({ op: "steps", delta: { random: [1, 3] } }, ctx({ rng: rngOf(0.99) })).stepsDelta).toBe(3);
  });

  it("dice changes count and sides independently", () => {
    const out = apply({ op: "dice", count: 1, sides: -2 }, ctx({ trigger: "beforeMovement" }));
    expect(out.diceCountDelta).toBe(1);
    expect(out.diceSidesDelta).toBe(-2);
    expect(apply({ op: "dice", sides: 2 }, ctx()).diceCountDelta).toBe(0);
    expect(ACTIONS.dice.schema.safeParse({ op: "dice" }).success).toBe(false);
  });

  it("balance folds into the turn at a hook and becomes an intent elsewhere", () => {
    expect(apply({ op: "balance", amount: -1 }, ctx({ trigger: "afterCellEffect" })).balanceDelta).toBe(-1);
    const onUse = apply(
      { op: "balance", amount: -2, to: "target" },
      ctx({ trigger: "onUse", turn: null, target: player("sp-them") }),
      run({ entry: { slug: "pickaxe", kind: "item" } }),
    );
    expect(onUse.balanceDelta).toBe(0);
    expect(onUse.intents).toEqual([{ kind: "balance", to: "sp-them", delta: -2, reason: "item:pickaxe" }]);
    expect(apply({ op: "balance", amount: 0 }, ctx()).intents).toEqual([]);
    expect(apply({ op: "balance", amount: 3, to: "target" }, ctx({ turn: null })).intents).toEqual([]);
  });

  it("skipCellEffect and noMove are vetoes", () => {
    expect(apply({ op: "skipCellEffect" }, ctx()).skipCellEffect).toBe(true);
    expect(apply({ op: "noMove" }, ctx()).cancelMove).toBe(true);
  });

  it("grants resolve the reference and the recipient, or quietly do nothing", () => {
    const toTarget = apply(
      { op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" },
      ctx({ trigger: "onUse", turn: null, target: player("sp-them") }),
    );
    expect(toTarget.intents).toEqual([
      { kind: "grant", entryId: IDS.slowed, key: "slowed", entryKind: "effect", to: "sp-them" },
    ]);
    const item = apply({ op: "grantItem", entry: { entry: IDS.salve }, to: "self" }, ctx({ trigger: "onUse" }));
    expect(item.intents).toEqual([
      { kind: "grant", entryId: IDS.salve, key: "cleansing_salve", entryKind: "item", to: "sp-me" },
    ]);
    expect(apply({ op: "grantEffect", entry: { entry: IDS.gift }, to: "self" }, ctx()).intents).toEqual([]);
    expect(apply({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" }, ctx()).intents).toEqual([]);
  });

  it("cleanse asks to clear the holder's effects", () => {
    expect(apply({ op: "cleanse", character: "penalty", count: "all" }, ctx()).intents).toEqual([
      { kind: "cleanse", from: "sp-me", character: "penalty", tags: [], count: "all" },
    ]);
    expect(apply({ op: "cleanse", tags: ["dice"], count: 1 }, ctx()).intents).toEqual([
      { kind: "cleanse", from: "sp-me", character: null, tags: ["dice"], count: 1 },
    ]);
  });
});

describe("actions — harm (D9)", () => {
  const env = staticEnv();
  it("is a property of the action: a hostile grant harms, a gift does not", () => {
    expect(ACTIONS.grantEffect.harm({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" }, env)).toBe("target");
    expect(ACTIONS.grantEffect.harm({ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "target" }, env)).toBe("none");
    expect(ACTIONS.grantEffect.harm({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "self" }, env)).toBe("none");
    expect(ACTIONS.grantItem.harm({ op: "grantItem", entry: { entry: IDS.gift }, to: "target" }, env)).toBe("target");
  });

  it("taking points from a rival harms, giving them does not", () => {
    expect(ACTIONS.balance.harm({ op: "balance", amount: -2, to: "target" }, env)).toBe("target");
    expect(ACTIONS.balance.harm({ op: "balance", amount: 2, to: "target" }, env)).toBe("none");
    expect(ACTIONS.balance.harm({ op: "balance", amount: -2 }, env)).toBe("none");
  });

  it("actions on the holder never harm a target", () => {
    for (const a of [
      { op: "steps", delta: -3 },
      { op: "dice", sides: -2 },
      { op: "skipCellEffect" },
      { op: "noMove" },
      { op: "cleanse", count: "all" },
    ] as ActionDoc[]) {
      expect(actionDef(a).harm(a, env)).toBe("none");
    }
  });
});

describe("actions — power cost, in cells (calibrated: ./play-model)", () => {
  const env = staticEnv();
  const any = ANY_PLAY;
  const passed: PlayContext = { outcome: "passed", cells: null };
  const dropped: PlayContext = { outcome: "dropped", cells: null };
  it("steps are worth their cells, either way the move goes", () => {
    expect(ACTIONS.steps.cost({ op: "steps", delta: 3 }, env, any)).toBeGreaterThan(ACTIONS.steps.cost({ op: "steps", delta: 1 }, env, any));
    expect(ACTIONS.steps.cost({ op: "steps", delta: { random: [1, 3] } }, env, any)).toBe(2);
    expect(ACTIONS.steps.cost({ op: "steps", delta: -2 }, env, dropped)).toBe(2);
  });

  it("dice help a pass and hurt a drop, which moves back with every die", () => {
    // A die more: 3.5 forward on a pass, 3.5 back on a drop at its weight.
    expect(ACTIONS.dice.cost({ op: "dice", count: 1 }, env, any)).toBeCloseTo(0.6 * 3.5 - 0.48 * 3.5);
    expect(ACTIONS.dice.cost({ op: "dice", count: 1 }, env, passed)).toBeCloseTo(3.5);
    expect(ACTIONS.dice.cost({ op: "dice", count: 1 }, env, dropped)).toBeCloseTo(1.2 * 3.5);
    // Two sides more: a cell on a pass's one die, two cells back on a drop's two.
    expect(ACTIONS.dice.cost({ op: "dice", sides: 2 }, env, any)).toBeCloseTo(Math.abs(0.6 * 1 - 0.48 * 2));
    expect(ACTIONS.dice.cost({ op: "dice", sides: 2 }, env, passed)).toBeCloseTo(1);
  });

  it("points are worth a fifth of a cell, and a loss takes only what is there", () => {
    expect(ACTIONS.balance.cost({ op: "balance", amount: 4 }, env, any)).toBeCloseTo(0.8);
    expect(ACTIONS.balance.cost({ op: "balance", amount: -4 }, env, any)).toBeCloseTo(0.24);
  });

  it("keeping a cell from firing is worth what the cell would have done", () => {
    expect(ACTIONS.skipCellEffect.cost({ op: "skipCellEffect" }, env, { outcome: null, cells: ["penalty"] })).toBeCloseTo(1);
    expect(ACTIONS.skipCellEffect.cost({ op: "skipCellEffect" }, env, { outcome: null, cells: ["bonus"] })).toBeCloseTo(1.1);
    // On any cell the good and the bad nearly cancel.
    expect(ACTIONS.skipCellEffect.cost({ op: "skipCellEffect" }, env, any)).toBeLessThan(0.2);
    expect(ACTIONS.skipCellEffect.cost({ op: "skipCellEffect" }, env, { outcome: null, cells: ["normal"] })).toBe(0);
  });

  it("staying put loses a pass's move and spares a drop's", () => {
    expect(ACTIONS.noMove.cost({ op: "noMove" }, env, passed)).toBeCloseTo(3.5);
    expect(ACTIONS.noMove.cost({ op: "noMove" }, env, dropped)).toBeCloseTo(1.2 * 7);
    expect(ACTIONS.noMove.cost({ op: "noMove" }, env, any)).toBeCloseTo(Math.abs(0.48 * 7 - 0.6 * 3.5));
  });

  it("what a throw holds is what the rule fires on: a low sum, the entry's own dice (spec §14)", () => {
    // "No move when a pass shows 2 or less": a 1 or a 2 is lost, 1.5 on average.
    const low = CONDITIONS.diceShow.narrow!({ op: "diceShow", of: "sum", cmp: "lte", value: 2 }, env, passed);
    expect(ACTIONS.noMove.cost({ op: "noMove" }, env, low)).toBeCloseTo(1.5);
    // A die on its own says nothing about the sum.
    expect(CONDITIONS.diceShow.narrow!({ op: "diceShow", of: "any", cmp: "eq", value: 6 }, env, passed)).toBe(passed);
    // Two dice on a pass («Кости судьбы»): 4 or less is 1 throw in 6, and loses 3⅓ on average.
    const two: PlayContext = { ...passed, dice: { pass: { count: 2, sides: 6 }, drop: { count: 2, sides: 6 } } };
    const cond = { op: "diceShow", of: "sum", cmp: "lte", value: 4 } as const;
    expect(CONDITIONS.diceShow.likelihood(cond, env, two)).toBeCloseTo(1 / 6);
    expect(ACTIONS.noMove.cost({ op: "noMove" }, env, CONDITIONS.diceShow.narrow!(cond, env, two))).toBeCloseTo(20 / 6);
    // The better of two throws of two dice gains more than of one.
    expect(ACTIONS.bestOfTwo.cost({ op: "bestOfTwo" }, env, two)).toBeGreaterThan(ACTIONS.bestOfTwo.cost({ op: "bestOfTwo" }, env, passed));
  });

  it("a firing's way: forward, points and penalties kept off help; the rest sets back", () => {
    const sign = <P extends { op: string }>(def: { sign?: (p: P, e: typeof env, play: PlayContext) => number }, p: P, play: PlayContext = any) =>
      def.sign?.(p, env, play) ?? 1;
    expect(sign(ACTIONS.steps, { op: "steps", delta: 2 })).toBe(1);
    expect(sign(ACTIONS.steps, { op: "steps", delta: -2 })).toBe(-1);
    expect(sign(ACTIONS.noMove, { op: "noMove" }, passed)).toBe(-1);
    expect(sign(ACTIONS.noMove, { op: "noMove" }, dropped)).toBe(1);
    expect(sign(ACTIONS.balance, { op: "balance", amount: -1 })).toBe(-1);
    expect(sign(ACTIONS.balance, { op: "balance", amount: -1, to: "target" })).toBe(1);
    expect(sign(ACTIONS.skipCellEffect, { op: "skipCellEffect" }, { outcome: null, cells: ["penalty"] })).toBe(1);
    expect(sign(ACTIONS.skipCellEffect, { op: "skipCellEffect" }, { outcome: null, cells: ["bonus"] })).toBe(-1);
    expect(sign(ACTIONS.worstOfTwo, { op: "worstOfTwo" }, passed)).toBe(-1);
    expect(sign(ACTIONS.rerollOn, { op: "rerollOn", values: [1] }, passed)).toBe(1);
    expect(sign(ACTIONS.direction, { op: "direction", lowerHalf: "back" }, passed)).toBe(-1);
    expect(sign(ACTIONS.move, { op: "move", by: -2, who: "target" })).toBe(1);
    expect(sign(ACTIONS.move, { op: "move", by: { random: [-3, -1] } })).toBe(-1);
    expect(sign(ACTIONS.swapPositions, { op: "swapPositions", with: "nearestBehind" })).toBe(-1);
    expect(sign(ACTIONS.halveGap, { op: "halveGap", who: "nearestBehind" })).toBe(-1);
    expect(sign(ACTIONS.cleanse, { op: "cleanse", character: "bonus", count: 1 })).toBe(-1);
    expect(sign(ACTIONS.remove, { op: "remove", what: "any", character: "penalty", pick: "choice" })).toBe(1);
    expect(sign(ACTIONS.remove, { op: "remove", what: "item", character: "bonus", pick: "random", from: "target" })).toBe(1);
    expect(sign(ACTIONS.remove, { op: "remove", what: "effect", character: "bonus", pick: "newest" })).toBe(-1);
    // A grant's way is the character of what it hands out, and to whom.
    const facts = { ...env, resolve: () => ({ entryId: IDS.slowed, slug: "slowed", kind: "effect" as const, character: "penalty" as const, tags: [], name: { ru: "З" } }) };
    expect(ACTIONS.grantEffect.sign!({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "self" }, facts, any)).toBe(-1);
    expect(ACTIONS.grantEffect.sign!({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" }, facts, any)).toBe(1);
    // A bonus handed to the chosen player helps them; one nobody can resolve is taken to help.
    expect(ACTIONS.grantItem.sign!({ op: "grantItem", entry: { entry: IDS.salve }, to: "target" }, env, any)).toBe(-1);
    expect(ACTIONS.grantItem.sign!({ op: "grantItem", entry: { entry: "99999999-9999-4999-8999-999999999999" }, to: "target" }, env, any)).toBe(1);
  });

  it("a cleanse and a grant: what is taken away, what is handed out", () => {
    expect(ACTIONS.cleanse.cost({ op: "cleanse", count: "all" }, env, any)).toBe(3);
    expect(ACTIONS.cleanse.cost({ op: "cleanse", count: 1 }, env, any)).toBe(1);
    // Unknown, a grant is worth a typical entry; known, what that entry is worth.
    expect(ACTIONS.grantEffect.cost({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "self" }, env, any)).toBe(2);
    expect(ACTIONS.grantItem.cost({ op: "grantItem", entry: { entry: IDS.salve }, to: "self" }, env, any)).toBe(2);
    const known = { ...env, powerOf: (id: string) => (id === IDS.slowed ? 1.9 : null) };
    expect(ACTIONS.grantEffect.cost({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" }, known, any)).toBe(1.9);
  });
});

describe("actions — text", () => {
  it("steps: longer, shorter, unchanged and either way", () => {
    expect(say({ op: "steps", delta: 2 })).toEqual({
      en: "your move is 2 cells longer",
      ru: "ваш ход длиннее на 2 клетки",
      uk: "ваш хід довший на 2 клітинки",
    });
    expect(say({ op: "steps", delta: { param: "steps" } })).toEqual({
      en: "your move is 1 cell shorter",
      ru: "ваш ход короче на 1 клетку",
      uk: "ваш хід коротший на 1 клітинку",
    });
    expect(say({ op: "steps", delta: 0 })).toEqual({
      en: "your move is unchanged",
      ru: "ваш ход не меняется",
      uk: "ваш хід не змінюється",
    });
    expect(say({ op: "steps", delta: { random: [-2, 3] } })).toEqual({
      en: "your move changes by −2…+3 cells",
      ru: "ваш ход меняется на −2…+3 клетки",
      uk: "ваш хід змінюється на −2…+3 клітинки",
    });
    expect(say({ op: "steps", delta: { random: [-5, -1] } }).ru).toBe("ваш ход короче на 1–5 клеток");
  });

  it("dice: sides and count, up and down", () => {
    expect(say({ op: "dice", sides: 2 })).toEqual({
      en: "your dice have 2 more sides",
      ru: "у ваших кубиков на 2 грани больше",
      uk: "у ваших кубиків на 2 грані більше",
    });
    expect(say({ op: "dice", count: -1, sides: -2 })).toEqual({
      en: "you roll 1 fewer die and your dice have 2 fewer sides",
      ru: "вы бросаете на 1 кубик меньше и у ваших кубиков на 2 грани меньше",
      uk: "ви кидаєте на 1 кубик менше і у ваших кубиків на 2 грані менше",
    });
    expect(say({ op: "dice", count: 2 }).en).toBe("you roll 2 more dice");
    expect(say({ op: "dice", sides: { random: [-1, 1] } }).en).toBe("your dice change by −1…+1 side");
    expect(say({ op: "dice", count: { random: [-1, 1] } }).ru).toBe("число кубиков меняется на −1…+1 кубик");
    expect(say({ op: "dice", sides: 0 })).toEqual({
      en: "your dice are unchanged",
      ru: "кубики не меняются",
      uk: "кубики не змінюються",
    });
  });

  it("balance: gain, lose, for whom", () => {
    expect(say({ op: "balance", amount: 1 })).toEqual({
      en: "you gain 1 point",
      ru: "вы получаете 1 очко",
      uk: "ви отримуєте 1 очко",
    });
    expect(say({ op: "balance", amount: -3, to: "target" })).toEqual({
      en: "the chosen player loses 3 points",
      ru: "выбранный игрок теряет 3 очка",
      uk: "обраний гравець втрачає 3 очки",
    });
    expect(say({ op: "balance", amount: { random: [-1, 2] } }).en).toBe("your balance changes by −1…+2 points");
    expect(say({ op: "balance", amount: 0 }).en).toBe("your balance changes by 0");
  });

  it("vetoes", () => {
    expect(say({ op: "skipCellEffect" })).toEqual({
      en: "the cell does not fire",
      ru: "клетка не срабатывает",
      uk: "клітинка не спрацьовує",
    });
    expect(say({ op: "noMove" })).toEqual({
      en: "you do not move",
      ru: "вы остаётесь на месте",
      uk: "ви залишаєтеся на місці",
    });
  });

  it("grants name what they hand out", () => {
    expect(say({ op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" })).toEqual({
      en: "the chosen player gets “Slowed”",
      ru: "выбранный игрок получает «Замедление»",
      uk: "обраний гравець отримує «Уповільнення»",
    });
    expect(say({ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }).en).toBe("you get “Tailwind”");
    expect(say({ op: "grantItem", entry: { entry: IDS.salve }, to: "self" })).toEqual({
      en: "you get the item “Cleansing Salve”",
      ru: "вы получаете предмет «Очищающая мазь»",
      // No uk name: the ru one stands in.
      uk: "ви отримуєте предмет «Очищающая мазь»",
    });
    expect(say({ op: "grantItem", entry: { entry: IDS.salve }, to: "target" }).ru).toBe(
      "выбранный игрок получает предмет «Очищающая мазь»",
    );
  });

  it("cleanse: all, one, several, by tag", () => {
    expect(say({ op: "cleanse", character: "penalty", count: "all" })).toEqual({
      en: "removes all your penalty effects",
      ru: "снимает все ваши штрафные эффекты",
      uk: "знімає всі ваші штрафні ефекти",
    });
    expect(say({ op: "cleanse", count: 1 })).toEqual({
      en: "removes one of your effects",
      ru: "снимает один ваш эффект",
      uk: "знімає один ваш ефект",
    });
    expect(say({ op: "cleanse", character: "bonus", count: 2, tags: ["dice", "movement"] })).toEqual({
      en: "removes up to 2 of your bonus effects tagged “dice” or “movement”",
      ru: "снимает до 2 ваших бонусных эффектов с меткой «dice» или «movement»",
      uk: "знімає до 2 ваших бонусних ефектів з міткою «dice» або «movement»",
    });
  });
});

describe("wave A — the dice pipeline (spec §7.2)", () => {
  const passed: PlayContext = { outcome: "passed", cells: null };
  const dropped: PlayContext = { outcome: "dropped", cells: null };
  const env = staticEnv();

  it("diceShow reads the dice of the turn: their sum, or any single die", () => {
    const low: ConditionDoc = { op: "diceShow", of: "sum", cmp: "lte", value: 4 };
    const one: ConditionDoc = { op: "diceShow", of: "any", cmp: "eq", value: 1 };
    const turn = (diceResults: number[]) => ctx({ turn: { rollSeq: 1, outcome: "passed", diceResults } });
    expect(evaluate(low, turn([1, 3]))).toBe(true);
    expect(evaluate(low, turn([2, 3]))).toBe(false);
    expect(evaluate(one, turn([6, 1]))).toBe(true);
    expect(evaluate(one, turn([6, 2]))).toBe(false);
    expect(evaluate({ op: "diceShow", of: "sum", cmp: "gte", value: 7 }, turn([3, 4]))).toBe(true);
    // No dice thrown, or no turn: nothing to show.
    expect(evaluate(low, turn([]))).toBe(false);
    expect(evaluate(low, ctx({ turn: null }))).toBe(false);
  });

  it("diceShow holds as often as a new season's dice show it — given a pass or a drop", () => {
    const low: ConditionDoc = { op: "diceShow", of: "sum", cmp: "lte", value: 4 };
    expect(conditionDef(low).likelihood(low, env, passed)).toBeCloseTo(4 / 6);
    expect(conditionDef(low).likelihood(low, env, dropped)).toBeCloseTo(6 / 36);
    expect(conditionDef(low).likelihood(low, env, ANY_PLAY)).toBeCloseTo(0.6 * (4 / 6) + 0.4 * (6 / 36));
    const six: ConditionDoc = { op: "diceShow", of: "any", cmp: "eq", value: 6 };
    expect(conditionDef(six).likelihood(six, env, dropped)).toBeCloseTo(11 / 36);
  });

  it("the roll actions ask the pipeline, and nothing else", () => {
    const at = ctx({ trigger: "afterDice" });
    expect(apply({ op: "rerollOn", values: [1, 2] }, at)).toMatchObject({ rerollValues: [1, 2], stepsDelta: 0 });
    expect(apply({ op: "bestOfTwo" }, at)).toMatchObject({ bestOfTwo: true, worstOfTwo: false });
    expect(apply({ op: "worstOfTwo" }, at)).toMatchObject({ worstOfTwo: true, bestOfTwo: false });
    expect(apply({ op: "resultModify", delta: -2 }, at)).toMatchObject({ resultDelta: -2, resultCap: null });
    expect(apply({ op: "resultModify", cap: 3 }, at)).toMatchObject({ resultDelta: 0, resultCap: 3 });
    expect(apply({ op: "resultModify", delta: { param: "steps" } }, at, run({ params: { steps: -3 } }))).toMatchObject({
      resultDelta: -3,
    });
    expect(apply({ op: "direction", lowerHalf: "back" }, at)).toMatchObject({ reverseLowerHalf: true });
  });

  it("resultModify needs a delta or a cap; rerollOn needs faces", () => {
    expect(ACTIONS.resultModify.schema.safeParse({ op: "resultModify" }).success).toBe(false);
    expect(ACTIONS.rerollOn.schema.safeParse({ op: "rerollOn", values: [] }).success).toBe(false);
    expect(ACTIONS.rerollOn.schema.safeParse({ op: "rerollOn", values: [0] }).success).toBe(false);
  });

  it("reads in three languages", () => {
    expect(say({ op: "rerollOn", values: [1] })).toEqual({
      en: "a die showing 1 is thrown again once",
      ru: "кубик, на котором выпало 1, перебрасывается один раз",
      uk: "кубик, на якому випало 1, перекидається один раз",
    });
    expect(say({ op: "rerollOn", values: [5, 6] }).en).toBe("a die showing 5 or 6 is thrown again once");
    expect(say({ op: "bestOfTwo" }).ru).toBe("кубики бросаются дважды, засчитывается лучший бросок");
    expect(say({ op: "worstOfTwo" }).uk).toBe("кубики кидаються двічі, зараховується гірший кидок");
    expect(say({ op: "resultModify", delta: -2 })).toEqual({
      en: "the dice result is 2 lower (never below 1)",
      ru: "результат кубиков на 2 меньше (не меньше 1)",
      uk: "результат кубиків на 2 менший (не менше 1)",
    });
    expect(say({ op: "resultModify", delta: 1, cap: 3 }).en).toBe("the dice result is 1 higher and at most 3");
    expect(say({ op: "resultModify", cap: 3 }).ru).toBe("результат кубиков не больше 3");
    expect(say({ op: "resultModify", delta: { random: [-1, 1] } }).uk).toBe("результат кубиків змінюється на −1…+1 (не менше 1)");
    expect(say({ op: "direction", lowerHalf: "back" }).en).toBe(
      "the lower half of the dice range moves you back by the result, the upper half forward",
    );
    expect(say({ op: "diceShow", of: "sum", cmp: "lte", value: 4 })).toEqual({
      en: "the dice show 4 or less",
      ru: "на кубиках выпало 4 или меньше",
      uk: "на кубиках випало 4 або менше",
    });
    expect(say({ op: "diceShow", of: "any", cmp: "eq", value: 6 }).ru).toBe("на одном из кубиков выпало 6");
  });

  it("power: what a pass gains and a drop loses, on a new season's dice", () => {
    // A 1 thrown again on one die: (3.5 − 1) / 6 more on a pass.
    expect(ACTIONS.rerollOn.cost({ op: "rerollOn", values: [1] }, env, passed)).toBeCloseTo(2.5 / 6);
    // A drop throws two dice, and a higher result is a longer move back.
    expect(ACTIONS.rerollOn.cost({ op: "rerollOn", values: [1] }, env, dropped)).toBeCloseTo(1.2 * 2 * (2.5 / 6));
    // The better of two d6: 161/36 against 3.5.
    expect(ACTIONS.bestOfTwo.cost({ op: "bestOfTwo" }, env, passed)).toBeCloseTo(161 / 36 - 3.5);
    expect(ACTIONS.worstOfTwo.cost({ op: "worstOfTwo" }, env, passed)).toBeCloseTo(3.5 - 91 / 36);
    // −2, never below 1: faces 1–3 all become 1.
    expect(ACTIONS.resultModify.cost({ op: "resultModify", delta: -2 }, env, passed)).toBeCloseTo(3.5 - 2);
    expect(ACTIONS.resultModify.cost({ op: "resultModify", cap: 3 }, env, passed)).toBeCloseTo(3.5 - 2.5);
    // The lower half going back costs twice what it would have gained.
    expect(ACTIONS.direction.cost({ op: "direction", lowerHalf: "back" }, env, passed)).toBeCloseTo(2);
    // Better for the holder on both results, so it is worth something either way.
    expect(ACTIONS.bestOfTwo.cost({ op: "bestOfTwo" }, env, ANY_PLAY)).toBeGreaterThan(
      ACTIONS.bestOfTwo.cost({ op: "bestOfTwo" }, env, passed) * 0.6,
    );
  });
});

describe("wave A — out-of-turn moves (spec §7.3)", () => {
  const me = player("sp-me", { position: 10 });
  const rival = player("sp-rival", { position: 16 });
  const onUse = (over: Partial<RuleContext> = {}) => ctx({ trigger: "onUse", turn: null, self: me, target: rival, ...over });
  const env = staticEnv();
  const chaos = {
    table: {
      die: 20,
      rows: [
        { upTo: 1, value: -5 },
        { upTo: 5, value: -2 },
        { upTo: 10, value: 0 },
        { upTo: 15, value: 2 },
        { upTo: 19, value: 4 },
        { upTo: 20, value: 8 },
      ],
    },
  };

  it("asks the executor to move — positions are read when the move is carried out", () => {
    expect(apply({ op: "move", by: 3 }, onUse()).intents).toEqual([
      { kind: "move", who: "sp-me", to: { by: 3 }, key: "test_entry" },
    ]);
    expect(apply({ op: "move", by: -2, who: "target" }, onUse()).intents).toEqual([
      { kind: "move", who: "sp-rival", to: { by: -2 }, key: "test_entry" },
    ]);
    // A table is rolled as the rule runs: 0.5 is face 11, two cells forward.
    expect(apply({ op: "move", by: chaos }, onUse({ rng: rngOf(0.5) })).intents[0]).toMatchObject({ to: { by: 2 } });
    expect(apply({ op: "moveToTarget", at: "before" }, onUse()).intents).toEqual([
      { kind: "move", who: "sp-me", to: { player: "sp-rival", at: "before" }, key: "test_entry" },
    ]);
    expect(apply({ op: "swapPositions", with: "target" }, onUse()).intents[0]).toMatchObject({ to: { swapWith: "sp-rival" } });
    expect(apply({ op: "swapPositions", with: "nearestBehind" }, onUse()).intents[0]).toMatchObject({
      who: "sp-me",
      to: { swapWith: { nearestBehind: "sp-me" } },
    });
    expect(apply({ op: "rollbackLastMove", who: "target" }, onUse()).intents[0]).toMatchObject({
      who: "sp-rival",
      to: { lastMoveStart: true },
    });
    expect(apply({ op: "halveGap", who: "nearestBehind" }, onUse()).intents).toEqual([
      { kind: "move", who: { nearestBehind: "sp-me" }, to: { halfwayTo: "sp-me" }, key: "test_entry" },
    ]);
    // Nobody chosen: nothing to aim at.
    expect(apply({ op: "move", by: -2, who: "target" }, onUse({ target: null })).intents).toEqual([]);
    expect(apply({ op: "moveToTarget", at: "cell" }, onUse({ target: null })).intents).toEqual([]);
    expect(apply({ op: "swapPositions", with: "target" }, onUse({ target: null })).intents).toEqual([]);
  });

  it("only at the executor's triggers, and a jump to a player only with one chosen", () => {
    for (const op of ["move", "moveToTarget", "swapPositions", "rollbackLastMove", "halveGap"] as const) {
      expect(ACTIONS[op].triggers).toEqual(["onUse", "onPickup", "onApply", "onExpire"]);
      expect(ACTIONS[op].stage).toBe("A");
    }
    expect(ACTIONS.moveToTarget.aimedOnly).toBe(true);
    expect(ACTIONS.move.needsTarget({ op: "move", by: 1, who: "target" })).toBe(true);
    expect(ACTIONS.move.needsTarget({ op: "move", by: 1 })).toBe(false);
  });

  it("harm (D9): moving a rival back, swapping with them or undoing their move is aimed at them", () => {
    expect(ACTIONS.move.harm({ op: "move", by: -2, who: "target" }, env)).toBe("target");
    expect(ACTIONS.move.harm({ op: "move", by: 2, who: "target" }, env)).toBe("none");
    expect(ACTIONS.move.harm({ op: "move", by: -2 }, env)).toBe("none");
    expect(ACTIONS.swapPositions.harm({ op: "swapPositions", with: "target" }, env)).toBe("target");
    expect(ACTIONS.swapPositions.harm({ op: "swapPositions", with: "nearestBehind" }, env)).toBe("none");
    expect(ACTIONS.rollbackLastMove.harm({ op: "rollbackLastMove", who: "target" }, env)).toBe("target");
    expect(ACTIONS.halveGap.harm({ op: "halveGap", who: "nearestBehind" }, env)).toBe("none");
  });

  it("power: the cells moved — a table at its faces' odds, a gap at the play model's", () => {
    expect(ACTIONS.move.cost({ op: "move", by: 3 }, env, ANY_PLAY)).toBe(3);
    expect(ACTIONS.move.cost({ op: "move", by: { random: [-3, -1] } }, env, ANY_PLAY)).toBe(2);
    expect(ACTIONS.move.cost({ op: "move", by: chaos }, env, ANY_PLAY)).toBeCloseTo(1.05);
    expect(ACTIONS.moveToTarget.cost({ op: "moveToTarget", at: "cell" }, env, ANY_PLAY)).toBe(6);
    expect(ACTIONS.moveToTarget.cost({ op: "moveToTarget", at: "before" }, env, ANY_PLAY)).toBe(5);
    expect(ACTIONS.swapPositions.cost({ op: "swapPositions", with: "target" }, env, ANY_PLAY)).toBe(12);
    expect(ACTIONS.swapPositions.cost({ op: "swapPositions", with: "nearestBehind" }, env, ANY_PLAY)).toBe(8);
    expect(ACTIONS.rollbackLastMove.cost({ op: "rollbackLastMove", who: "target" }, env, ANY_PLAY)).toBe(3.5);
    expect(ACTIONS.rollbackLastMove.cost({ op: "rollbackLastMove", who: "self" }, env, ANY_PLAY)).toBe(7);
    expect(ACTIONS.halveGap.cost({ op: "halveGap", who: "nearestBehind" }, env, ANY_PLAY)).toBe(2);
  });

  it("reads in three languages", () => {
    expect(say({ op: "move", by: 3 })).toEqual({
      en: "you instantly move 3 cells forward",
      ru: "вы мгновенно перемещаетесь на 3 клетки вперёд",
      uk: "ви миттєво переміщуєтеся на 3 клітинки уперед",
    });
    expect(say({ op: "move", by: -2, who: "target" })).toEqual({
      en: "the chosen player instantly moves 2 cells back",
      ru: "выбранный игрок мгновенно перемещается на 2 клетки назад",
      uk: "обраний гравець миттєво переміщується на 2 клітинки назад",
    });
    expect(say({ op: "move", by: { random: [-3, -1] } }).en).toBe("you instantly move 1–3 cells back");
    expect(say({ op: "move", by: { random: [-1, 2] } }).en).toBe("you instantly move −1…+2 cells");
    expect(say({ op: "move", by: 0 }).ru).toBe("вы мгновенно перемещаетесь на месте");
    expect(say({ op: "move", by: chaos })).toEqual({
      en: "you instantly move by a d20 roll: 1 → 5 back, 2–5 → 2 back, 6–10 → stay put, 11–15 → 2 forward, 16–19 → 4 forward, 20 → 8 forward",
      ru: "вы мгновенно перемещаетесь по броску d20: 1 — на 5 назад, 2–5 — на 2 назад, 6–10 — на месте, 11–15 — на 2 вперёд, 16–19 — на 4 вперёд, 20 — на 8 вперёд",
      uk: "ви миттєво переміщуєтеся за кидком d20: 1 — на 5 назад, 2–5 — на 2 назад, 6–10 — на місці, 11–15 — на 2 уперед, 16–19 — на 4 уперед, 20 — на 8 уперед",
    });
    expect(say({ op: "moveToTarget", at: "cell" }).en).toBe("you instantly move to the chosen player's cell");
    expect(say({ op: "moveToTarget", at: "before" }).ru).toBe("вы мгновенно перемещаетесь на клетку прямо перед выбранным игроком");
    expect(say({ op: "swapPositions", with: "nearestBehind" }).uk).toBe("ви миттєво міняєтеся місцями з найближчим суперником позаду");
    expect(say({ op: "swapPositions", with: "target" }).en).toBe("you instantly swap places with the chosen player");
    expect(say({ op: "rollbackLastMove", who: "target" }).en).toBe(
      "the chosen player instantly returns to the cell their last move started from",
    );
    expect(say({ op: "rollbackLastMove", who: "self" }).ru).toBe("вы мгновенно возвращаетесь на клетку, с которой начался ваш последний ход");
    expect(say({ op: "halveGap", who: "nearestBehind" })).toEqual({
      en: "the nearest rival behind you instantly halves the gap to you",
      ru: "ближайший соперник позади вас мгновенно сокращает отставание от вас вдвое",
      uk: "найближчий суперник позаду вас миттєво скорочує відставання від вас удвічі",
    });
  });
});

describe("wave A — removing instances (spec §6.10)", () => {
  const me = player("sp-me");
  const rival = player("sp-rival");
  const onUse = (over: Partial<RuleContext> = {}) => ctx({ trigger: "onUse", turn: null, self: me, target: rival, ...over });
  const remove = (over: Record<string, unknown> = {}) => ({ op: "remove", what: "any", character: "penalty", pick: "newest", ...over }) as ActionDoc;

  it("asks the executor to take what matches: the one chosen, or the newest or random ones", () => {
    expect(apply(remove({ pick: "choice" }), onUse({ choice: "inst-1" })).intents).toEqual([
      { kind: "remove", from: "sp-me", what: "any", character: "penalty", entryId: null, rarity: null, pick: { instanceId: "inst-1" }, count: 1 },
    ]);
    // Nothing chosen: nothing to take.
    expect(apply(remove({ pick: "choice" }), onUse()).intents).toEqual([]);
    expect(apply(remove({ what: "item", character: "bonus", pick: "random", count: 2, from: "target" }), onUse()).intents).toEqual([
      { kind: "remove", from: "sp-rival", what: "item", character: "bonus", entryId: null, rarity: null, pick: "random", count: 2 },
    ]);
    expect(apply(remove({ what: "effect", character: undefined, entry: { entry: IDS.slowed } }), onUse()).intents).toEqual([
      { kind: "remove", from: "sp-me", what: "effect", character: null, entryId: IDS.slowed, rarity: null, pick: "newest", count: 1 },
    ]);
    // No one chosen to take from.
    expect(apply(remove({ from: "target" }), onUse({ target: null })).intents).toEqual([]);
  });

  it("harms a rival unless it takes their penalties; costs what it takes", () => {
    const env = staticEnv();
    expect(actionDef(remove({ from: "target", character: "bonus" })).harm(remove({ from: "target", character: "bonus" }), env)).toBe("target");
    expect(actionDef(remove({ from: "target" })).harm(remove({ from: "target" }), env)).toBe("none");
    expect(actionDef(remove()).harm(remove(), env)).toBe("none");
    // Three unnamed instances: each worth what an unknown entry is.
    expect(actionDef(remove({ count: 3 })).cost(remove({ count: 3 }), env, ANY_PLAY)).toBe(6);
    expect(ACTIONS.remove.refs(remove({ what: "effect", entry: { entry: IDS.slowed } }) as never)).toEqual([
      { ref: { entry: IDS.slowed }, kind: "effect" },
    ]);
    expect(ACTIONS.remove.triggers).toEqual(["onUse", "onPickup", "onApply", "onExpire", "onOutcome", "onTick", "onSameCell"]);
  });

  it("refuses a choice that is not one of the user's own, and an entry of both kinds", () => {
    const parse = (a: Record<string, unknown>) => ACTIONS.remove.schema.safeParse({ op: "remove", what: "any", pick: "newest", ...a }).success;
    expect(parse({ pick: "choice" })).toBe(true);
    expect(parse({ pick: "choice", from: "target" })).toBe(false);
    expect(parse({ pick: "choice", count: 2 })).toBe(false);
    expect(parse({ entry: { entry: IDS.slowed } })).toBe(false);
    expect(parse({ what: "effect", entry: { entry: IDS.slowed } })).toBe(true);
  });
});

describe("wave A — standing, items held, the chosen player (spec §6.2, §6.5)", () => {
  const env = staticEnv();
  const passed: PlayContext = { outcome: "passed", cells: null };
  const item = (character: "bonus" | "penalty") => ({ ...FACTS[IDS.tailwind]!, kind: "item" as const, character });

  it("reads in three languages, with the agreement each needs", () => {
    expect(say({ op: "rank", is: "leader" })).toEqual({ en: "you are in the lead", ru: "вы лидируете", uk: "ви лідируєте" });
    expect(say({ op: "rank", is: "last" }).ru).toBe("вы на последнем месте");
    expect(say({ op: "rank", lte: 3 })).toEqual({ en: "you are among the first 3", ru: "вы среди первых 3", uk: "ви серед перших 3" });
    expect(say({ op: "rank", lte: 1 }).en).toBe("you are in the lead");
    expect(say({ op: "itemCount", cmp: "gte", value: 2, character: "bonus" })).toEqual({
      en: "you hold 2 bonus items or more",
      ru: "у вас 2 бонусных предмета или больше",
      uk: "у вас 2 бонусні предмети або більше",
    });
    expect(say({ op: "itemCount", cmp: "eq", value: 1, character: "penalty" })).toEqual({
      en: "you hold exactly 1 cursed item",
      ru: "у вас ровно 1 проклятый предмет",
      uk: "у вас рівно 1 проклятий предмет",
    });
    expect(say({ op: "itemCount", cmp: "lte", value: 5 }).ru).toBe("у вас 5 предметов или меньше");
    expect(say({ op: "itemCount", cmp: "eq", value: 0, character: "penalty" })).toEqual({
      en: "you hold no cursed items",
      ru: "у вас нет проклятых предметов",
      uk: "у вас немає проклятих предметів",
    });
    expect(say({ op: "targetRelative", is: "behind" })).toEqual({
      en: "the chosen player is behind you",
      ru: "выбранный игрок позади вас",
      uk: "обраний гравець позаду вас",
    });
    expect(say({ op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" })).toEqual({
      en: "your roll is lower than the chosen player's last roll",
      ru: "ваш бросок меньше последнего броска выбранного игрока",
      uk: "ваш кидок менший за останній кидок обраного гравця",
    });
  });

  it("a number read from the moment reads as what it counts", () => {
    expect(say({ op: "steps", delta: { source: "diceSum" } })).toEqual({
      en: "your move is longer by the dice result",
      ru: "ваш ход длиннее на сумму кубиков",
      uk: "ваш хід довший на суму кубиків",
    });
    expect(say({ op: "resultModify", delta: { source: "itemCount", multiplier: -1 } })).toEqual({
      en: "the dice result is lower by 1 for each item you hold (never below 1)",
      ru: "результат кубиков меньше на 1 за каждый ваш предмет (не меньше 1)",
      uk: "результат кубиків менший на 1 за кожен ваш предмет (не менше 1)",
    });
    expect(say({ op: "steps", delta: { source: "itemCount", character: "bonus", multiplier: 2 } })).toEqual({
      en: "your move is longer by 2 cells for each bonus item you hold",
      ru: "ваш ход длиннее на 2 клетки за каждый ваш бонусный предмет",
      uk: "ваш хід довший на 2 клітинки за кожен ваш бонусний предмет",
    });
    expect(say({ op: "balance", amount: { source: "targetLastRoll" } })).toEqual({
      en: "you gain points equal to the chosen player's last roll",
      ru: "вы получаете столько очков, сколько выпало в последнем броске выбранного игрока",
      uk: "ви отримуєте стільки очок, скільки випало в останньому кидку обраного гравця",
    });
    expect(say({ op: "balance", amount: { source: "itemCount", character: "penalty", multiplier: -1 } }).en).toBe(
      "you lose 1 point for each cursed item you hold",
    );
    expect(say({ op: "move", by: { source: "itemCount", multiplier: -1 } })).toEqual({
      en: "you instantly move back by 1 cell for each item you hold",
      ru: "вы мгновенно перемещаетесь назад на 1 клетку за каждый ваш предмет",
      uk: "ви миттєво переміщуєтеся назад на 1 клітинку за кожен ваш предмет",
    });
  });

  it("a source reads the moment, and is nothing where the moment does not know it", () => {
    const turn = { rollSeq: 1, outcome: "passed" as const, diceResults: [2, 5] };
    expect(apply({ op: "balance", amount: { source: "diceSum" } }, ctx({ trigger: "onOutcome", turn }))).toMatchObject({ balanceDelta: 7 });
    expect(apply({ op: "resultModify", delta: { source: "itemCount", multiplier: -1 } }, ctx({ selfEntries: [item("bonus"), item("penalty")] }))).toMatchObject({
      resultDelta: -2,
    });
    expect(apply({ op: "steps", delta: { source: "diceSum" } }, ctx({ turn: { rollSeq: 1 } }))).toMatchObject({ stepsDelta: 0 });
    const rival = player("sp-rival", { lastRoll: 8 });
    expect(apply({ op: "move", by: { source: "targetLastRoll" } }, ctx({ trigger: "onUse", turn: null, target: rival })).intents).toEqual([
      { kind: "move", who: "sp-me", to: { by: 8 }, key: "test_entry" },
    ]);
  });

  it("standing and items held are read off the holder", () => {
    expect(evaluate({ op: "rank", is: "last" }, ctx({ self: player("sp-me", { behind: 0 }) }))).toBe(true);
    expect(evaluate({ op: "rank", lte: 2 }, ctx({ self: player("sp-me", { rank: 3 }) }))).toBe(false);
    expect(evaluate({ op: "itemCount", cmp: "lte", value: 1 }, ctx({ selfEntries: [item("bonus"), item("penalty")] }))).toBe(false);
    expect(evaluate({ op: "itemCount", cmp: "lte", value: { param: "pct" } }, ctx({ selfEntries: [item("bonus")] }))).toBe(true);
  });

  it("holds as often as the play model says", () => {
    const at = (c: ConditionDoc, play: PlayContext = ANY_PLAY) => conditionDef(c).likelihood(c, env, play);
    // One place of a field of eight.
    expect(at({ op: "rank", is: "leader" })).toBeCloseTo(1 / 8);
    expect(at({ op: "rank", lte: 4 })).toBeCloseTo(0.5);
    // One item held on average, spread like Poisson: none at all e⁻¹ of the time.
    expect(at({ op: "itemCount", cmp: "eq", value: 0 })).toBeCloseTo(Math.exp(-1));
    expect(at({ op: "itemCount", cmp: "gte", value: 1 })).toBeCloseTo(1 - Math.exp(-1));
    expect(at({ op: "itemCount", cmp: "gte", value: 0 })).toBe(1);
    expect(at({ op: "targetRelative", is: "ahead" })).toBe(0.5);
    // A pass's d6 against a last roll that was a pass's d6 or a drop's 2d6.
    const lower = at({ op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" }, passed);
    const passVsPass = 15 / 36;
    expect(lower).toBeGreaterThan(passVsPass);
    expect(lower).toBeLessThan(1);
  });

  it("power: a source is worth the play model's mean of what it reads", () => {
    const passedOnly: PlayContext = { outcome: "passed", cells: null };
    expect(ACTIONS.steps.cost({ op: "steps", delta: { source: "diceSum" } }, env, passedOnly)).toBeCloseTo(3.5);
    expect(ACTIONS.steps.cost({ op: "steps", delta: { source: "itemCount", multiplier: -2 } }, env, ANY_PLAY)).toBeCloseTo(2);
    expect(ACTIONS.move.cost({ op: "move", by: { source: "targetLastRoll" } }, env, ANY_PLAY)).toBeCloseTo(0.6 * 3.5 + 0.4 * 7);
    // −1 a item on a pass, one item on average: what −1 to the result is worth.
    expect(ACTIONS.resultModify.cost({ op: "resultModify", delta: { source: "itemCount", multiplier: -1 } }, env, passedOnly)).toBeCloseTo(
      ACTIONS.resultModify.cost({ op: "resultModify", delta: -1 }, env, passedOnly),
    );
  });

  it("only the numbers whose sentence can say it read a source", () => {
    expect(ACTIONS.steps.sourceFields).toEqual(["delta"]);
    expect(ACTIONS.dice.sourceFields).toBeUndefined();
    expect(ACTIONS.steps.schema.safeParse({ op: "steps", delta: { source: "itemCount" } }).success).toBe(false);
    expect(ACTIONS.steps.schema.safeParse({ op: "steps", delta: { source: "luck" } }).success).toBe(false);
  });
});

describe("wave B — item operations (spec §6.12)", () => {
  const me = player("sp-me");
  const rival = player("sp-rival");
  const onUse = (over: Partial<RuleContext> = {}) =>
    ctx({ trigger: "onUse", turn: null, self: me, target: rival, instanceId: "inst-used", ...over });
  const env = staticEnv();
  const cost = (a: ActionDoc) => actionDef(a).cost(a, env, ANY_PLAY);
  const sign = (a: ActionDoc) => actionDef(a).sign?.(a, env, ANY_PLAY) ?? 1;
  const harm = (a: ActionDoc) => actionDef(a).harm(a, env);

  it("a steal takes random bonus items of the chosen player — never the item in use — and attacks them", () => {
    const steal = { op: "stealItem", count: 2, rarity: ["common", "rare"] } as ActionDoc;
    expect(apply(steal, onUse()).intents).toEqual([
      { kind: "moveItems", from: "sp-rival", to: "sp-me", count: 2, rarity: ["common", "rare"], how: "stolen", except: "inst-used" },
    ]);
    expect(apply({ op: "stealItem" }, onUse({ target: null })).intents).toEqual([]);
    expect(apply({ op: "stealItem" }, onUse()).intents[0]).toMatchObject({ count: 1, rarity: null });
    expect(harm(steal)).toBe("target");
    expect(ACTIONS.stealItem.triggers).toEqual(["onUse"]);
    expect(ACTIONS.stealItem.aimedOnly).toBe(true);
    // The user gains what the chosen player loses: twice an item, by rarity (PLAY_MODEL.heldItem).
    expect(cost({ op: "stealItem" })).toBeCloseTo(2 * heldItemWorth(null), 1);
    expect(cost({ op: "stealItem", rarity: ["epic"] })).toBe(2 * PLAY_MODEL.heldItem.epic.worth);
    expect(sign({ op: "stealItem" })).toBe(1);
  });

  it("a gift goes to the chosen player or a random rival, and costs the holder what it gives", () => {
    const toRival = { op: "transferItem", to: "randomRival" } as ActionDoc;
    expect(apply(toRival, ctx({ trigger: "onApply", turn: null, instanceId: "fx-1" })).intents).toEqual([
      { kind: "moveItems", from: "sp-me", to: { randomRivalOf: "sp-me" }, count: 1, rarity: null, how: "given", except: "fx-1" },
    ]);
    expect(apply({ op: "transferItem", to: "target", count: 3 }, onUse()).intents).toEqual([
      { kind: "moveItems", from: "sp-me", to: "sp-rival", count: 3, rarity: null, how: "given", except: "inst-used" },
    ]);
    expect(apply({ op: "transferItem", to: "target" }, onUse({ target: null })).intents).toEqual([]);
    expect(actionDef(toRival).needsTarget(toRival)).toBe(false);
    expect(harm(toRival)).toBe("none");
    expect(sign(toRival)).toBe(-1);
    // Only as many as the holder has to give: one held more often than two.
    expect(cost({ op: "transferItem", to: "randomRival", count: 2 })).toBeLessThan(2 * cost(toRival));
    expect(cost(toRival)).toBeGreaterThan(0);
  });

  it("a trade and a copy are with the chosen player; a copy harms no one", () => {
    expect(apply({ op: "swapItems", rarity: ["common"] }, onUse()).intents).toEqual([
      { kind: "swapItems", a: "sp-me", b: "sp-rival", rarity: ["common"], except: "inst-used" },
    ]);
    expect(apply({ op: "copyItem" }, onUse()).intents).toEqual([
      { kind: "copyItem", from: "sp-rival", to: "sp-me", rarity: null, except: "inst-used" },
    ]);
    expect(apply({ op: "swapItems" }, onUse({ target: null })).intents).toEqual([]);
    expect(apply({ op: "copyItem" }, onUse({ target: null })).intents).toEqual([]);
    expect(harm({ op: "swapItems" })).toBe("target");
    expect(harm({ op: "copyItem" })).toBe("none");
    const common = PLAY_MODEL.heldItem.common.worth;
    expect(cost({ op: "copyItem", rarity: ["common"] })).toBe(common);
    // A third of a common item more, both ways.
    expect(cost({ op: "swapItems", rarity: ["common"] })).toBeCloseTo((2 / 3) * common, 5);
  });

  it("a pick from the catalog hands the user the item picked as they used it", () => {
    const facts = { ...FACTS[IDS.salve]! };
    const pickEnv = run({ resolve: (ref) => (ref.entry === IDS.salve ? facts : resolve(ref.entry)) });
    expect(apply({ op: "grantChosen", rarity: ["common"] }, onUse({ entryChoice: IDS.salve }), pickEnv).intents).toEqual([
      { kind: "grant", entryId: IDS.salve, key: "cleansing_salve", entryKind: "item", to: "sp-me" },
    ]);
    // Nothing picked, or an effect: nothing handed out.
    expect(apply({ op: "grantChosen" }, onUse()).intents).toEqual([]);
    expect(apply({ op: "grantChosen" }, onUse({ entryChoice: IDS.slowed })).intents).toEqual([]);
    expect(ACTIONS.grantChosen.triggers).toEqual(["onUse"]);
    expect(harm({ op: "grantChosen" })).toBe("none");
    // The user picks the strongest the filter lets through.
    expect(cost({ op: "grantChosen", rarity: ["common"] })).toBe(2);
    expect(cost({ op: "grantChosen", rarity: ["common", "epic"] })).toBe(6);
  });

  it("one more spin of a wheel, at the end of the move or of the game", () => {
    const out = apply({ op: "extraSpin", pool: "penalty" }, ctx({ trigger: "onOutcome" }));
    expect(out.extraSpins).toEqual(["negative"]);
    expect(apply({ op: "extraSpin", pool: "bonus" }, ctx({ trigger: "afterCellEffect" })).extraSpins).toEqual(["positive"]);
    expect(ACTIONS.extraSpin.triggers).toEqual(["afterCellEffect", "onOutcome"]);
    expect(sign({ op: "extraSpin", pool: "bonus" })).toBe(1);
    expect(sign({ op: "extraSpin", pool: "penalty" })).toBe(-1);
    // What each wheel drops, read off `core` (PLAY_MODEL.spin).
    expect(cost({ op: "extraSpin", pool: "bonus" })).toBe(PLAY_MODEL.spin.bonus);
    expect(cost({ op: "extraSpin", pool: "penalty" })).toBe(-PLAY_MODEL.spin.penalty);
  });

  it("reads in three languages, with the agreement each needs", () => {
    expect(say({ op: "stealItem" })).toEqual({
      en: "you take a random bonus item from the chosen player",
      ru: "вы забираете у выбранного игрока случайный бонусный предмет",
      uk: "ви забираєте в обраного гравця випадковий бонусний предмет",
    });
    expect(say({ op: "stealItem", count: 2, rarity: ["common", "rare"] })).toEqual({
      en: "you take 2 random common or rare bonus items from the chosen player",
      ru: "вы забираете у выбранного игрока 2 случайных обычных или редких бонусных предмета",
      uk: "ви забираєте в обраного гравця 2 випадкові звичайні або рідкісні бонусні предмети",
    });
    expect(say({ op: "stealItem", count: 5 }).ru).toBe("вы забираете у выбранного игрока 5 случайных бонусных предметов");
    expect(say({ op: "transferItem", to: "randomRival" })).toEqual({
      en: "a random bonus item of yours goes to a random rival",
      ru: "случайный ваш бонусный предмет переходит к случайному сопернику",
      uk: "випадковий ваш бонусний предмет переходить до випадкового суперника",
    });
    expect(say({ op: "transferItem", to: "target", count: 2 })).toEqual({
      en: "2 random bonus items of yours go to the chosen player",
      ru: "2 случайных ваших бонусных предмета переходят к выбранному игроку",
      uk: "2 випадкові ваші бонусні предмети переходять до обраного гравця",
    });
    expect(say({ op: "swapItems", rarity: ["epic"] })).toEqual({
      en: "you and the chosen player give each other a random epic bonus item",
      ru: "вы и выбранный игрок отдаёте друг другу по случайному эпическому бонусному предмету",
      uk: "ви й обраний гравець віддаєте одне одному по випадковому епічному бонусному предмету",
    });
    expect(say({ op: "copyItem", rarity: ["common"] })).toEqual({
      en: "you get a copy of a random common bonus item the chosen player holds; they keep theirs",
      ru: "вы получаете копию случайного обычного бонусного предмета выбранного игрока, а он сохраняет свой",
      uk: "ви отримуєте копію випадкового звичайного бонусного предмета обраного гравця, а він зберігає свій",
    });
    expect(say({ op: "grantChosen", rarity: ["common"], activation: "active" })).toEqual({
      en: "you get a common active bonus item of your choice from the season's catalog",
      ru: "вы получаете обычный активный бонусный предмет на ваш выбор из каталога сезона",
      uk: "ви отримуєте звичайний активний бонусний предмет на ваш вибір з каталогу сезону",
    });
    expect(say({ op: "grantChosen", rarity: ["epic"] }).en).toBe("you get an epic bonus item of your choice from the season's catalog");
    expect(say({ op: "grantChosen", activation: "passive" }).ru).toBe("вы получаете пассивный бонусный предмет на ваш выбор из каталога сезона");
    expect(say({ op: "extraSpin", pool: "bonus" })).toEqual({
      en: "the bonus wheel spins once more",
      ru: "бонусное колесо крутится ещё раз",
      uk: "бонусне колесо крутиться ще раз",
    });
    expect(say({ op: "extraSpin", pool: "penalty" }).uk).toBe("штрафне колесо крутиться ще раз");
  });

  it("a removal may name the rarities it takes, in its sentence too", () => {
    const stone = { op: "remove", what: "item", character: "bonus", rarity: ["common"], pick: "choice" } as ActionDoc;
    expect(apply(stone, onUse({ choice: "inst-2" })).intents).toEqual([
      { kind: "remove", from: "sp-me", what: "item", character: "bonus", entryId: null, rarity: ["common"], pick: { instanceId: "inst-2" }, count: 1 },
    ]);
    expect(say(stone)).toEqual({
      en: "removes one of your common bonus items of your choice",
      ru: "снимает на ваш выбор один ваш обычный бонусный предмет",
      uk: "знімає на ваш вибір один ваш звичайний бонусний предмет",
    });
    expect(say({ op: "remove", what: "item", rarity: ["rare", "epic"], pick: "random", count: 2 } as ActionDoc)).toEqual({
      en: "removes 2 random rare or epic items of yours",
      ru: "снимает 2 случайных ваших редких или эпических предмета",
      uk: "знімає 2 випадкові ваші рідкісні або епічні предмети",
    });
    // What a common bonus item is worth, not an unknown entry's.
    expect(cost(stone)).toBe(PLAY_MODEL.heldItem.common.worth);
  });

  it("refuses a rarity listed twice, one entry with a rarity, and counts out of range", () => {
    expect(ACTIONS.stealItem.schema.safeParse({ op: "stealItem", rarity: ["common", "common"] }).success).toBe(false);
    expect(ACTIONS.stealItem.schema.safeParse({ op: "stealItem", rarity: [] }).success).toBe(false);
    expect(ACTIONS.stealItem.schema.safeParse({ op: "stealItem", count: 9 }).success).toBe(false);
    expect(ACTIONS.transferItem.schema.safeParse({ op: "transferItem" }).success).toBe(false);
    expect(ACTIONS.extraSpin.schema.safeParse({ op: "extraSpin", pool: "event" }).success).toBe(false);
    expect(
      ACTIONS.remove.schema.safeParse({ op: "remove", what: "item", entry: { entry: IDS.salve }, rarity: ["rare"], pick: "newest" }).success,
    ).toBe(false);
  });
});

describe("wave B — what arrives, and protection (spec §6.13)", () => {
  const env = staticEnv();
  const on = (incoming: PlayContext["incoming"]): PlayContext => ({ ...ANY_PLAY, incoming });
  const cost = (a: ActionDoc, play: PlayContext = ANY_PLAY) => actionDef(a).cost(a, env, play);
  const sign = (a: ActionDoc, play: PlayContext = ANY_PLAY) => actionDef(a).sign?.(a, env, play) ?? 1;
  const arriving = (arrival: RuleContext["arrival"]) => ctx({ trigger: "onIncoming", turn: null, arrival });
  const penaltyEffect = { ...FACTS[IDS.slowed]! };
  const bonusItem = { ...FACTS[IDS.salve]! };

  it("two new moments: what arrives, and what holds — an effect's or a held item's, run by the executor", () => {
    for (const name of ["onIncoming", "whileActive"] as const) {
      expect(TRIGGERS[name]).toMatchObject({ stage: "B", hook: null, held: true, kinds: ["effect", "item"] });
    }
    // A standing state is asked any time: a chance would answer differently each time.
    expect(CONDITIONS.chance.triggers).toContain("onIncoming");
    expect(CONDITIONS.chance.triggers).not.toContain("whileActive");
    expect(CONDITIONS.hasEntry.triggers).toEqual(expect.arrayContaining(["onIncoming", "whileActive"]));
  });

  it("incoming reads what arrives: a rival's harm, an entry of a kind and character, a move back", () => {
    const harm: ConditionDoc = { op: "incoming", is: "harm" };
    const penalty: ConditionDoc = { op: "incoming", is: "entry", kind: "effect", character: "penalty" };
    const anyEntry: ConditionDoc = { op: "incoming", is: "entry" };
    expect(evaluate(harm, arriving({ is: "harm", entry: null }))).toBe(true);
    expect(evaluate(harm, arriving({ is: "moveBack", entry: null }))).toBe(false);
    expect(evaluate(harm, ctx({ arrival: null }))).toBe(false);
    expect(evaluate(penalty, arriving({ is: "entry", entry: penaltyEffect }))).toBe(true);
    expect(evaluate(penalty, arriving({ is: "entry", entry: bonusItem }))).toBe(false);
    expect(evaluate(anyEntry, arriving({ is: "entry", entry: bonusItem }))).toBe(true);
    expect(evaluate({ op: "incoming", is: "moveBack" }, arriving({ is: "moveBack", entry: null }))).toBe(true);
    // A kind and a character narrow an entry, nothing else.
    expect(CONDITIONS.incoming.schema.safeParse({ op: "incoming", is: "harm", kind: "item" }).success).toBe(false);
    expect(CONDITIONS.incoming.triggers).toEqual(["onIncoming"]);
  });

  it("incoming holds as often as such an arrival comes in a roll, and says what the answer is worth on", () => {
    const likely = (c: ConditionDoc) => conditionDef(c).likelihood(c, env, ANY_PLAY);
    const { arrival } = PLAY_MODEL;
    expect(likely({ op: "incoming", is: "harm" })).toBeCloseTo(arrival.harm.perRoll, 4);
    expect(likely({ op: "incoming", is: "moveBack" })).toBeCloseTo(arrival.moveBack.perRoll, 4);
    expect(likely({ op: "incoming", is: "entry", kind: "item", character: "bonus" })).toBeCloseTo(arrival.entry.bonus.item.perRoll, 4);
    expect(likely({ op: "incoming", is: "entry" })).toBeCloseTo(0.2, 2);
    const narrowed = conditionDef({ op: "incoming", is: "entry", character: "penalty" } as ConditionDoc).narrow!(
      { op: "incoming", is: "entry", character: "penalty" } as ConditionDoc,
      env,
      ANY_PLAY,
    );
    expect(narrowed.incoming).toEqual({ is: "entry", kind: null, character: "penalty" });
  });

  it("the answers, and the standing states, set what the executor and the use checks read", () => {
    const at = arriving({ is: "harm", entry: null });
    expect(apply({ op: "block" }, at).answer).toEqual({ kind: "block" });
    expect(apply({ op: "reflect" }, at).answer).toEqual({ kind: "reflect" });
    expect(apply({ op: "amplify", factor: 3 }, at).answer).toEqual({ kind: "amplify", factor: 3 });
    expect(apply({ op: "replace", with: 0 }, at).answer).toEqual({ kind: "replace", with: 0 });
    const still = ctx({ trigger: "whileActive", turn: null });
    expect(apply({ op: "untargetable" }, still).untargetable).toBe(true);
    expect(apply({ op: "forbidItems" }, still).forbidItems).toBe(true);
    const out = emptyRuleOutput();
    actionDef({ op: "pierce", value: 1 }).apply({ op: "pierce", value: 1 }, still, run(), out);
    actionDef({ op: "pierce", value: 2 }).apply({ op: "pierce", value: 2 }, still, run(), out);
    expect(out.pierce).toBe(3);
    for (const op of ["block", "reflect", "amplify", "replace"] as const) expect(ACTIONS[op].triggers).toEqual(["onIncoming"]);
    for (const op of ["untargetable", "forbidItems", "pierce"] as const) expect(ACTIONS[op].triggers).toEqual(["whileActive"]);
    // Protection harms no one (§6.3).
    for (const op of ["block", "reflect", "untargetable", "forbidItems"] as const) expect(actionDef({ op } as ActionDoc).harm({ op } as ActionDoc, env)).toBe("none");
  });

  it("power: what it stops, turns back, doubles or replaces — the arrival's way", () => {
    // Stopping a harm or a penalty helps; stopping a bonus is a setback — what each is worth (PLAY_MODEL.arrival).
    const { harm: harmful, entry } = PLAY_MODEL.arrival;
    expect(cost({ op: "block" }, on({ is: "harm" }))).toBe(harmful.worth);
    expect(sign({ op: "block" }, on({ is: "harm" }))).toBe(1);
    expect(cost({ op: "block" }, on({ is: "entry", kind: "item", character: "bonus" }))).toBeCloseTo(entry.bonus.item.worth, 5);
    expect(sign({ op: "block" }, on({ is: "entry", kind: "item", character: "bonus" }))).toBe(-1);
    // Stopped, and turned back on the sender.
    expect(cost({ op: "reflect" })).toBeCloseTo(harmful.worth + harmful.turned, 1);
    // A penalty effect fired twice is one more penalty effect.
    expect(cost({ op: "amplify", factor: 2 }, on({ is: "entry", kind: "effect", character: "penalty" }))).toBe(entry.penalty.effect.worth);
    expect(sign({ op: "amplify", factor: 2 }, on({ is: "entry", kind: "effect", character: "penalty" }))).toBe(-1);
    // A bonus item tripled is two more.
    expect(cost({ op: "amplify", factor: 3 }, on({ is: "entry", kind: "item", character: "bonus" }))).toBeCloseTo(2 * entry.bonus.item.worth, 5);
    // A move back stopped, and a cell forward.
    expect(cost({ op: "replace", with: 1 }, on({ is: "moveBack" }))).toBeCloseTo(PLAY_MODEL.arrival.moveBack.worth + 1, 5);
    expect(sign({ op: "replace", with: 1 }, on({ is: "moveBack" }))).toBe(1);
    // Per roll: the harm it keeps off; the items it keeps waiting, half lost; a protection pierced.
    expect(cost({ op: "untargetable" })).toBeCloseTo(harmful.perRoll * harmful.worth, 4);
    expect(cost({ op: "forbidItems" })).toBeCloseTo(PLAY_MODEL.delayLoss * entry.bonus.item.perRoll * entry.bonus.item.worth, 4);
    expect(sign({ op: "forbidItems" })).toBe(-1);
    // A protection stands in the way as often as the pack's are held («Щит», «Зеркальный щит»).
    expect(cost({ op: "pierce", value: 1 })).toBeCloseTo(harmful.perRoll * harmful.worth * PLAY_MODEL.shielded, 4);
    expect(sign({ op: "pierce", value: 1 })).toBe(-1);
  });

  it("reads in three languages", () => {
    expect(say({ op: "incoming", is: "harm" })).toEqual({
      en: "a rival aims a harmful action at you",
      ru: "соперник направляет на вас вредное действие",
      uk: "суперник спрямовує на вас шкідливу дію",
    });
    expect(say({ op: "incoming", is: "entry", kind: "item", character: "penalty" }).en).toBe("you receive a cursed item");
    expect(say({ op: "incoming", is: "entry", character: "bonus" }).ru).toBe("вы получаете бонусный предмет или эффект");
    expect(say({ op: "incoming", is: "entry" }).uk).toBe("ви отримуєте предмет або ефект");
    expect(say({ op: "incoming", is: "moveBack" }).en).toBe("an item or effect is about to move you back");
    expect(say({ op: "block" })).toEqual({ en: "it is cancelled", ru: "это отменяется", uk: "це скасовується" });
    expect(say({ op: "reflect" }).ru).toBe("это отменяется и обращается против этого соперника");
    expect(say({ op: "amplify", factor: 2 })).toEqual({ en: "it fires twice", ru: "это срабатывает дважды", uk: "це спрацьовує двічі" });
    expect(say({ op: "amplify", factor: 3 }).en).toBe("it fires three times");
    expect(say({ op: "replace", with: 2 })).toEqual({
      en: "instead you move 2 cells forward",
      ru: "вместо этого вы перемещаетесь на 2 клетки вперёд",
      uk: "натомість ви переміщуєтеся на 2 клітинки уперед",
    });
    expect(say({ op: "replace", with: 0 }).en).toBe("instead you stay where you are");
    expect(say({ op: "untargetable" }).en).toBe("rivals cannot aim items at you");
    expect(say({ op: "forbidItems" }).uk).toBe("ви не можете використовувати предмети");
    expect(say({ op: "pierce", value: 1 }).ru).toBe("вредные действия против вас пробивают обычную защиту");
    expect(say({ op: "pierce", value: 2 }).en).toBe("harmful actions aimed at you pierce any protection");
  });

  it("refuses a factor, a pierce or cells out of range", () => {
    expect(ACTIONS.amplify.schema.safeParse({ op: "amplify", factor: 4 }).success).toBe(false);
    expect(ACTIONS.pierce.schema.safeParse({ op: "pierce", value: 3 }).success).toBe(false);
    expect(ACTIONS.replace.schema.safeParse({ op: "replace", with: 7 }).success).toBe(false);
    expect(ACTIONS.replace.schema.safeParse({ op: "replace" }).success).toBe(false);
  });
});

describe("wave B — the player's choices (spec §6.14)", () => {
  const env = staticEnv();
  const cost = (a: ActionDoc) => actionDef(a).cost(a, env, ANY_PLAY);
  const sign = (a: ActionDoc) => actionDef(a).sign?.(a, env, ANY_PLAY) ?? 1;

  it("victimChoice asks the holder through the executor: a `decide` intent for the instance that asked", () => {
    const out = apply({ op: "victimChoice", count: 2, orKeep: true }, ctx({ trigger: "onApply", turn: null, instanceId: "i-overload" }));
    expect(out.intents).toEqual([{ kind: "decide", who: "sp-me", count: 2, orKeep: true, instanceId: "i-overload", key: "test_entry" }]);
    expect(apply({ op: "victimChoice" }, ctx({ trigger: "onApply", turn: null })).intents).toEqual([
      { kind: "decide", who: "sp-me", count: 1, orKeep: false, instanceId: null, key: "test_entry" },
    ]);
    expect(ACTIONS.victimChoice.triggers).toEqual(["onApply", "onPickup", "onOutcome", "onTick"]);
    expect(ACTIONS.victimChoice.harm({ op: "victimChoice" }, env)).toBe("none");
  });

  it("holdLimit stands while it lasts: the strictest limit", () => {
    const still = ctx({ trigger: "whileActive", turn: null });
    const out = emptyRuleOutput();
    actionDef({ op: "holdLimit", max: 2 }).apply({ op: "holdLimit", max: 2 }, still, run(), out);
    actionDef({ op: "holdLimit", max: 1 }).apply({ op: "holdLimit", max: 1 }, still, run(), out);
    actionDef({ op: "holdLimit", max: 3 }).apply({ op: "holdLimit", max: 3 }, still, run(), out);
    expect(out.holdLimit).toBe(1);
    expect(ACTIONS.holdLimit.triggers).toEqual(["whileActive"]);
  });

  it("power: the commonest items given up, nothing with `orKeep`; what a limit burns in a roll — setbacks", () => {
    const common = PLAY_MODEL.heldItem.common.worth;
    expect(cost({ op: "victimChoice" })).toBe(common);
    expect(cost({ op: "victimChoice", count: 2 })).toBeCloseTo(2 * common, 9);
    expect(cost({ op: "victimChoice", count: 2, orKeep: true })).toBe(0);
    expect(sign({ op: "victimChoice" })).toBe(-1);
    // Held over one (a Poisson spread around 0.8, at the rarities' shares) and one more arriving, at a held item's worth.
    const shares = Object.values(PLAY_MODEL.heldItem).reduce((sum, h) => sum + h.share, 0);
    const arriving = PLAY_MODEL.arrival.entry.bonus.item.perRoll;
    expect(cost({ op: "holdLimit", max: 1 })).toBeCloseTo((0.8 - (1 - Math.exp(-0.8 * shares)) + arriving) * heldItemWorth(null), 3);
    expect(cost({ op: "holdLimit", max: 3 })).toBeLessThan(cost({ op: "holdLimit", max: 1 }));
    expect(sign({ op: "holdLimit", max: 1 })).toBe(-1);
  });

  it("reads in three languages", () => {
    expect(say({ op: "victimChoice" })).toEqual({
      en: "you discard a bonus item of your choice",
      ru: "вы сбрасываете бонусный предмет на ваш выбор",
      uk: "ви скидаєте бонусний предмет на ваш вибір",
    });
    expect(say({ op: "victimChoice", count: 2, orKeep: true })).toEqual({
      en: "you may discard 2 bonus items of your choice to be rid of it",
      ru: "вы можете сбросить 2 бонусных предмета на ваш выбор, чтобы избавиться от него",
      uk: "ви можете скинути 2 бонусні предмети на ваш вибір, щоб позбутися його",
    });
    expect(say({ op: "holdLimit", max: 1 })).toEqual({
      en: "you may hold at most 1 bonus item: when you hold more, you choose which one to keep and the rest burn",
      ru: "у вас может быть не больше 1 бонусного предмета: когда их больше, вы выбираете, какой оставить, а остальные сгорают",
      uk: "у вас може бути не більше 1 бонусного предмета: коли їх більше, ви обираєте, який залишити, а решта згорає",
    });
    expect(say({ op: "holdLimit", max: 2 }).ru).toBe(
      "у вас может быть не больше 2 бонусных предметов: когда их больше, вы выбираете, какие оставить, а остальные сгорают",
    );
    expect(say({ op: "holdLimit", max: 3 }).en).toContain("at most 3 bonus items");
  });

  it("refuses a count or a limit out of range", () => {
    expect(ACTIONS.victimChoice.schema.safeParse({ op: "victimChoice", count: 4 }).success).toBe(false);
    expect(ACTIONS.victimChoice.schema.safeParse({ op: "victimChoice", orKeep: false }).success).toBe(false);
    expect(ACTIONS.holdLimit.schema.safeParse({ op: "holdLimit", max: 0 }).success).toBe(false);
    expect(ACTIONS.holdLimit.schema.safeParse({ op: "holdLimit" }).success).toBe(false);
  });
});

describe("wave C — the next game (spec §6.16)", () => {
  const env = staticEnv();
  const cost = (a: ActionDoc) => actionDef(a).cost(a, env, ANY_PLAY);
  const sign = (a: ActionDoc) => actionDef(a).sign?.(a, env, ANY_PLAY) ?? 1;
  const picking = (over: Partial<RuleContext> = {}) =>
    ctx({ trigger: "beforeGameRoll", turn: null, games: { lastPassed: ["puzzle"], passed: ["puzzle", "horror"] }, ...over });
  const pool = (a: ActionDoc, context: RuleContext, environment = run()) => apply(a, context, environment).pool;

  it("a game is picked for the holder — the game service asks, not the turn; never an active item's moment", () => {
    expect(TRIGGERS.beforeGameRoll).toMatchObject({ stage: "C", hook: null, held: true, kinds: ["effect", "item"] });
    expect(TRIGGERS.beforeGameRoll.knows).toEqual({ outcome: false, cell: false, dice: false });
    for (const op of ["poolExclude", "poolRequire", "poolFavor"] as const) expect(ACTIONS[op].triggers).toEqual(["beforeGameRoll"]);
    expect(ACTIONS.poolFavor.readsPick).toBe(true);
  });

  it("an exclusion or a requirement reads the holder's sets as the moment knows them", () => {
    expect(pool({ op: "poolExclude", genres: "picked" }, picking({ chosen: { genre: "horror" } }))).toEqual([{ kind: "exclude", match: { genres: ["horror"] } }]);
    expect(pool({ op: "poolExclude", genres: "lastPassed" }, picking())).toEqual([{ kind: "exclude", match: { genres: ["puzzle"] } }]);
    expect(pool({ op: "poolExclude", genres: "passed" }, picking())).toEqual([{ kind: "exclude", match: { genres: ["puzzle", "horror"] } }]);
    expect(pool({ op: "poolRequire", years: "picked" }, picking({ chosen: { years: [1990, 1999] } }))).toEqual([
      { kind: "require", match: { years: { min: 1990, max: 1999 } } },
    ]);
    expect(pool({ op: "poolRequire", genres: ["RPG", "rpg", "Horror"] as never, rating: { min: 4 } }, picking())).toEqual([
      { kind: "require", match: { genres: ["rpg", "horror"], rating: { min: 4, max: null } } },
    ]);
  });

  it("a year a parameter sets reads the season's value", () => {
    const decls = { lastYear: { type: "int" as const, default: 2009, min: 1980, max: 2020 } };
    const action: ActionDoc = { op: "poolRequire", years: { max: { param: "lastYear" } } };
    expect(pool(action, picking(), run({ params: { lastYear: 2004 }, decls }))).toEqual([{ kind: "require", match: { years: { min: null, max: 2004 } } }]);
    expect(actionDef(action).paramsUsed(action)).toEqual(["lastYear"]);
    expect(actionDef({ op: "poolRequire", years: "picked" }).paramsUsed({ op: "poolRequire", years: "picked" })).toEqual([]);
  });

  it("a set that reads nothing — no pick of its kind, no game passed — says nothing at all", () => {
    expect(pool({ op: "poolExclude", genres: "picked" }, picking())).toEqual([]);
    expect(pool({ op: "poolRequire", genres: "picked" }, picking({ chosen: { years: [1990, 1999] } }))).toEqual([]);
    expect(pool({ op: "poolRequire", years: "picked", rating: { min: 4 } }, picking({ chosen: { genre: "rpg" } }))).toEqual([]);
    expect(pool({ op: "poolExclude", genres: "lastPassed" }, picking({ games: { lastPassed: null, passed: [] } }))).toEqual([]);
    expect(pool({ op: "poolExclude", genres: "passed" }, picking({ games: null }))).toEqual([]);
  });

  it("a favour weighs the game the use picked, and nothing without one", () => {
    expect(pool({ op: "poolFavor", factor: 3 }, picking({ chosen: { gameId: "g-1", title: "Celeste" } }))).toEqual([{ kind: "favor", gameId: "g-1", factor: 3 }]);
    expect(pool({ op: "poolFavor", factor: 3 }, picking({ chosen: { genre: "rpg" } }))).toEqual([]);
    expect(pool({ op: "poolFavor", factor: 3 }, picking())).toEqual([]);
  });

  it("an effect a use hands its user remembers what the use picked; one handed to anyone else does not", () => {
    const using = ctx({ trigger: "onUse", turn: null, pick: { genre: "rpg" } });
    const mine: ActionDoc = { op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" };
    expect(apply(mine, using).intents).toEqual([{ kind: "grant", entryId: IDS.tailwind, key: "tailwind", entryKind: "effect", to: "sp-me", chosen: { genre: "rpg" } }]);
    expect(apply(mine, ctx({ trigger: "onUse", turn: null })).intents[0]).not.toHaveProperty("chosen");
    const theirs: ActionDoc = { op: "grantEffect", entry: { entry: IDS.slowed }, to: "target" };
    expect(apply(theirs, { ...using, target: player("sp-them") }).intents[0]).not.toHaveProperty("chosen");
    const item: ActionDoc = { op: "grantItem", entry: { entry: IDS.salve }, to: "self" };
    expect(apply(item, using).intents[0]).not.toHaveProperty("chosen");
  });

  it("power: the chance to pass the game it leaves, times a pass instead of a drop — the pick up, the rest down", () => {
    // A pass instead of a drop: 3.5 forward and 7 back spared at the streak weight.
    expect(cost({ op: "poolRequire", genres: "picked" })).toBeCloseTo(0.1 * 11.9, 6);
    expect(cost({ op: "poolRequire", years: "picked" })).toBeCloseTo(0.07 * 11.9, 6);
    expect(cost({ op: "poolExclude", genres: "picked" })).toBeCloseTo(0.03 * 11.9, 6);
    expect(cost({ op: "poolExclude", years: "picked" })).toBeCloseTo(0.03 * 11.9, 6);
    expect(sign({ op: "poolRequire", genres: "picked" })).toBe(1);
    expect(cost({ op: "poolExclude", genres: "lastPassed" })).toBeCloseTo(0.04 * 11.9, 6);
    expect(cost({ op: "poolRequire", genres: ["horror"] })).toBeCloseTo(0.04 * 11.9, 6);
    expect(cost({ op: "poolRequire", years: { max: 2009 } })).toBeCloseTo(0.05 * 11.9, 6);
    expect(cost({ op: "poolExclude", rating: { max: 2 } })).toBeCloseTo(0.03 * 11.9, 6);
    expect(sign({ op: "poolExclude", genres: "passed" })).toBe(-1);
    // A rule naming several adds them up: the pick's +0.1 and a span's −0.05.
    expect(cost({ op: "poolRequire", genres: "picked", years: { max: 2009 } })).toBeCloseTo(0.05 * 11.9, 6);
    expect(sign({ op: "poolRequire", genres: "picked", years: { max: 2009 } })).toBe(1);
    expect(cost({ op: "poolFavor", factor: 3 })).toBeCloseTo(0.02 * 11.9, 6);
    expect(sign({ op: "poolFavor", factor: 3 })).toBe(1);
  });

  it("harms nobody: it shapes the holder's own game", () => {
    for (const a of [{ op: "poolExclude", genres: "passed" }, { op: "poolRequire", years: "picked" }, { op: "poolFavor", factor: 2 }] as ActionDoc[]) {
      expect(actionDef(a).harm(a, env)).toBe("none");
    }
  });

  it("reads in three languages", () => {
    expect(say({ op: "poolExclude", genres: "picked" })).toEqual({
      en: "games of the genre you picked cannot come up",
      ru: "не выпадают игры выбранного вами жанра",
      uk: "не випадають ігри обраного вами жанру",
    });
    expect(say({ op: "poolRequire", years: "picked" })).toEqual({
      en: "only games from the years you picked can come up",
      ru: "выпадают только игры выбранных вами лет выпуска",
      uk: "випадають лише ігри обраних вами років випуску",
    });
    expect(say({ op: "poolRequire", genres: ["horror", "rpg"], years: { max: 2009 } })).toEqual({
      en: "only games of the genres “horror” or “rpg” released in 2009 or earlier can come up",
      ru: "выпадают только игры жанров «horror» или «rpg», вышедшие в 2009 году или раньше",
      uk: "випадають лише ігри жанрів «horror» або «rpg», що вийшли в 2009 році або раніше",
    });
    expect(say({ op: "poolExclude", genres: "lastPassed" }).en).toBe("games sharing a genre with the last game you passed cannot come up");
    expect(say({ op: "poolExclude", genres: "passed" }).ru).toBe("не выпадают игры жанров, в которых вы уже прошли игру в этом сезоне");
    expect(say({ op: "poolRequire", years: { min: 1990, max: 1999 }, rating: { min: 3.5 } })).toEqual({
      en: "only games released in 1990–1999 and rated 3.5 or higher can come up",
      ru: "выпадают только игры, вышедшие в 1990–1999 годах, с рейтингом от 3,5",
      uk: "випадають лише ігри, що вийшли в 1990–1999 роках, з рейтингом від 3,5",
    });
    expect(say({ op: "poolExclude", rating: { max: 2 } }).en).toBe("games rated 2 or lower cannot come up");
    expect(say({ op: "poolFavor", factor: 3 })).toEqual({
      en: "the game you picked is three times as likely to come up",
      ru: "выбранная вами игра выпадает в 3 раза чаще",
      uk: "обрана вами гра випадає в 3 рази частіше",
    });
    expect(say({ op: "poolFavor", factor: 5 }).ru).toBe("выбранная вами игра выпадает в 5 раз чаще");
    expect(say({ op: "poolFavor", factor: 2 }).en).toBe("the game you picked is twice as likely to come up");
  });

  it("refuses games named by nothing, a genre in capitals, a span backwards or out of range, a rating past 5, a favour out of range", () => {
    const parse = (a: unknown) => ACTIONS.poolExclude.schema.safeParse(a).success;
    expect(parse({ op: "poolExclude" })).toBe(false);
    expect(parse({ op: "poolExclude", genres: ["Horror"] })).toBe(false);
    expect(parse({ op: "poolExclude", genres: ["rpg", "rpg"] })).toBe(false);
    expect(parse({ op: "poolExclude", genres: [] })).toBe(false);
    expect(parse({ op: "poolExclude", genres: "everything" })).toBe(false);
    expect(parse({ op: "poolExclude", years: {} })).toBe(false);
    expect(parse({ op: "poolExclude", years: { min: 2000, max: 1990 } })).toBe(false);
    expect(parse({ op: "poolExclude", years: { max: 1969 } })).toBe(false);
    expect(parse({ op: "poolExclude", rating: { min: 6 } })).toBe(false);
    expect(parse({ op: "poolExclude", rating: { min: 4, max: 3 } })).toBe(false);
    expect(parse({ op: "poolExclude", years: { max: { param: "lastYear" } }, rating: { min: 0 } })).toBe(true);
    expect(ACTIONS.poolRequire.schema.safeParse({ op: "poolRequire" }).success).toBe(false);
    expect(ACTIONS.poolFavor.schema.safeParse({ op: "poolFavor", factor: 1 }).success).toBe(false);
    expect(ACTIONS.poolFavor.schema.safeParse({ op: "poolFavor", factor: 6 }).success).toBe(false);
  });
});

describe("wave C — a choice of games, a game in flight replaced or set aside (spec §6.16, §7.12)", () => {
  const env = staticEnv();
  const cost = (a: ActionDoc) => actionDef(a).cost(a, env, ANY_PLAY);
  const sign = (a: ActionDoc) => actionDef(a).sign?.(a, env, ANY_PLAY) ?? 1;

  it("a choice stands where a game is picked; a reroll or a set-aside at the use of an item used on an open roll", () => {
    expect(ACTIONS.chooseOfN.triggers).toEqual(["beforeGameRoll"]);
    expect(ACTIONS.chooseOfN).not.toHaveProperty("readsPick");
    for (const op of ["rerollGame", "postponeGame"] as const) {
      expect(ACTIONS[op]).toMatchObject({ stage: "C", triggers: ["onUse"], openRollOnly: true });
    }
  });

  it("a choice asks the draw for that many games", () => {
    expect(apply({ op: "chooseOfN", n: 3 }, ctx({ trigger: "beforeGameRoll", turn: null })).pool).toEqual([{ kind: "choose", n: 3 }]);
  });

  it("a reroll or a set-aside asks for the user's own game — whomever the item is aimed at", () => {
    const using = { ...ctx({ trigger: "onUse", turn: null }), target: player("sp-them") };
    expect(apply({ op: "rerollGame" }, using).intents).toEqual([{ kind: "game", how: "reroll", who: "sp-me", afterRolls: null, key: "test_entry" }]);
    expect(apply({ op: "postponeGame" }, using).intents).toEqual([{ kind: "game", how: "postpone", who: "sp-me", afterRolls: 2, key: "test_entry" }]);
    expect(apply({ op: "postponeGame", afterRolls: 3 }, using).intents[0]).toMatchObject({ how: "postpone", afterRolls: 3 });
  });

  it("power: the chance to pass a game the holder chose, or would rather not have played", () => {
    expect(cost({ op: "chooseOfN", n: 2 })).toBeCloseTo(0.1 * 11.9, 6);
    expect(cost({ op: "chooseOfN", n: 3 })).toBeCloseTo(0.15 * 11.9, 6);
    expect(cost({ op: "chooseOfN", n: 5 })).toBeCloseTo(0.2 * 11.9, 6);
    expect(cost({ op: "rerollGame" })).toBeCloseTo(0.2 * 11.9, 6);
    expect(cost({ op: "postponeGame" })).toBeCloseTo(0.15 * 11.9, 6);
    for (const a of [{ op: "chooseOfN", n: 4 }, { op: "rerollGame" }, { op: "postponeGame", afterRolls: 4 }] as ActionDoc[]) {
      expect(sign(a)).toBe(1);
      expect(actionDef(a).harm(a, env)).toBe("none");
    }
  });

  it("reads in three languages", () => {
    expect(say({ op: "chooseOfN", n: 3 })).toEqual({
      en: "the draw offers 3 games and you take one",
      ru: "выпадают 3 игры на выбор — вы берёте одну",
      uk: "випадають 3 гри на вибір — ви берете одну",
    });
    expect(say({ op: "chooseOfN", n: 5 }).ru).toBe("выпадают 5 игр на выбор — вы берёте одну");
    expect(say({ op: "chooseOfN", n: 5 }).uk).toBe("випадають 5 ігор на вибір — ви берете одну");
    expect(say({ op: "rerollGame" })).toEqual({
      en: "your game in progress is replaced by a new one, without a judge and without spending the season's rerolls",
      ru: "ваша текущая игра заменяется новой — без судьи и без траты рероллов сезона",
      uk: "ваша поточна гра замінюється новою — без судді й без витрати реролів сезону",
    });
    expect(say({ op: "postponeGame" })).toEqual({
      en: "your game in progress is set aside and comes back as your game 2 rolls later; a new game is picked now",
      ru: "ваша текущая игра откладывается и вернётся к вам через 2 броска; сейчас выбирается новая игра",
      uk: "ваша поточна гра відкладається й повернеться до вас через 2 кидки; зараз обирається нова гра",
    });
    expect(say({ op: "postponeGame", afterRolls: 3 }).en).toContain("3 rolls later");
  });

  it("refuses a choice of fewer than 2 or more than 5, and a set-aside of under 2 or over 4 picks", () => {
    expect(ACTIONS.chooseOfN.schema.safeParse({ op: "chooseOfN", n: 1 }).success).toBe(false);
    expect(ACTIONS.chooseOfN.schema.safeParse({ op: "chooseOfN", n: 6 }).success).toBe(false);
    expect(ACTIONS.chooseOfN.schema.safeParse({ op: "chooseOfN" }).success).toBe(false);
    expect(ACTIONS.postponeGame.schema.safeParse({ op: "postponeGame", afterRolls: 1 }).success).toBe(false);
    expect(ACTIONS.postponeGame.schema.safeParse({ op: "postponeGame", afterRolls: 5 }).success).toBe(false);
    expect(ACTIONS.rerollGame.schema.safeParse({ op: "rerollGame", afterRolls: 2 }).success).toBe(false);
  });
});

describe("wave C — completion conditions (spec §6.17)", () => {
  const env = staticEnv();
  const cost = (a: ActionDoc) => actionDef(a).cost(a, env, ANY_PLAY);
  const sign = (a: ActionDoc) => actionDef(a).sign?.(a, env, ANY_PLAY) ?? 1;
  const hard: ActionDoc = { op: "addCondition", text: { ru: "Пройти на высокой сложности", en: "Beat it on hard" } };

  it("a condition stands where a game is assigned; immunity is held while the instance lasts", () => {
    expect(TRIGGERS.onRollCreated).toMatchObject({ stage: "C", kinds: ["effect", "item"], hook: null, held: true });
    expect(ACTIONS.addCondition).toMatchObject({ stage: "C", triggers: ["onRollCreated"] });
    expect(ACTIONS.conditionImmunity).toMatchObject({ stage: "C", triggers: ["whileActive"] });
  });

  it("a condition gives the game its text; immunity says so", () => {
    const assigned = ctx({ trigger: "onRollCreated", turn: null });
    expect(apply(hard, assigned).conditions).toEqual([{ ru: "Пройти на высокой сложности", en: "Beat it on hard" }]);
    expect(apply({ op: "conditionImmunity" }, ctx({ trigger: "whileActive", turn: null })).conditionImmunity).toBe(true);
  });

  it("power: a condition takes from the chance to pass the game; immunity keeps off those a game would get", () => {
    expect(cost(hard)).toBeCloseTo(0.05 * 11.9, 6);
    expect(sign(hard)).toBe(-1);
    expect(actionDef(hard).harm(hard, env)).toBe("none");
    // The conditions a game gets in a roll, read off `core` (PLAY_MODEL.arrival.condition);
    // one that waits for them, a condition each time it answers.
    expect(cost({ op: "conditionImmunity" })).toBeCloseTo(PLAY_MODEL.arrival.condition.perRoll * 0.05 * 11.9, 6);
    expect(actionDef({ op: "conditionImmunity" }).cost({ op: "conditionImmunity" }, env, { ...ANY_PLAY, waits: true })).toBeCloseTo(0.05 * 11.9, 6);
    expect(sign({ op: "conditionImmunity" })).toBe(1);
  });

  it("reads in three languages, the condition quoted in the reader's — Russian where it has none", () => {
    expect(say(hard)).toEqual({
      en: "the game gets a completion condition: “Beat it on hard”",
      ru: "игре добавляется условие прохождения: «Пройти на высокой сложности»",
      uk: "грі додається умова проходження: «Пройти на высокой сложности»",
    });
    expect(say({ op: "conditionImmunity" })).toEqual({
      en: "your games get no completion conditions",
      ru: "ваши игры не получают условий прохождения",
      uk: "ваші ігри не отримують умов проходження",
    });
  });

  it("refuses a condition without Russian, an empty one or one over 200 characters", () => {
    const parse = (a: unknown) => ACTIONS.addCondition.schema.safeParse(a).success;
    expect(parse({ op: "addCondition" })).toBe(false);
    expect(parse({ op: "addCondition", text: { en: "Hard" } })).toBe(false);
    expect(parse({ op: "addCondition", text: { ru: "   " } })).toBe(false);
    expect(parse({ op: "addCondition", text: { ru: "x".repeat(201) } })).toBe(false);
    expect(parse({ op: "addCondition", text: { ru: "x".repeat(200), en: "y", uk: "z" } })).toBe(true);
    expect(ACTIONS.conditionImmunity.schema.safeParse({ op: "conditionImmunity", all: true }).success).toBe(false);
  });
});

describe("wave D — objects on the board (spec §6.18)", () => {
  const env = staticEnv();
  const cost = (a: ActionDoc) => actionDef(a).cost(a, env, ANY_PLAY);
  const sign = (a: ActionDoc) => actionDef(a).sign?.(a, env, ANY_PLAY) ?? 1;
  const entered = ctx({ trigger: "onObjectEntered" });
  const OBJECT_OPS = ["stopMove", "push", "extend", "spinInstead"] as const;

  it("an item places itself as it is used; what it does stands where a move enters its cell", () => {
    expect(TRIGGERS.onObjectEntered).toMatchObject({ stage: "D", kinds: ["item"], hook: null, placed: true });
    expect(TRIGGERS.onObjectEntered.knows).toEqual({ outcome: true, cell: false, dice: true });
    expect(ACTIONS.placeObject).toMatchObject({ stage: "D", triggers: ["onUse"], placesOnly: true });
    for (const op of OBJECT_OPS) expect(ACTIONS[op]).toMatchObject({ stage: "D", triggers: ["onObjectEntered"] });
  });

  it("placing stands the item on the cell its use picked — no cell, nothing to stand on", () => {
    const placing = run({ entry: { slug: "mine", kind: "item" } });
    const used = (pick: RuleContext["pick"]) => apply({ op: "placeObject" }, ctx({ trigger: "onUse", turn: null, pick }), placing).intents;
    expect(used({ cell: 14 })).toEqual([{ kind: "place", by: "sp-me", cell: 14, key: "mine" }]);
    expect(used(null)).toEqual([]);
    expect(used({ genre: "rpg" })).toEqual([]);
  });

  it("an object answers the move that enters: a stop, a push, a longer move, a wheel in place of the cell", () => {
    expect(apply({ op: "stopMove" }, entered).object).toEqual({ stop: true, push: 0, extend: 0, spin: null });
    expect(apply({ op: "push", delta: -3 }, entered).object).toEqual({ stop: false, push: -3, extend: 0, spin: null });
    expect(apply({ op: "push", delta: { param: "steps" } }, entered).object.push).toBe(-1);
    expect(apply({ op: "extend", delta: 2 }, entered).object.extend).toBe(2);
    // A longer move never turns it back.
    expect(apply({ op: "extend", delta: -2 }, entered).object.extend).toBe(0);
    expect(apply({ op: "spinInstead", pool: "bonus" }, entered).object.spin).toBe("positive");
    expect(apply({ op: "spinInstead", pool: "penalty" }, entered).object.spin).toBe("negative");
  });

  it("power: a stop costs the half move it takes, a push and a longer move their cells, a wheel what it drops", () => {
    expect(cost({ op: "placeObject" })).toBe(0);
    expect(cost({ op: "stopMove" })).toBeCloseTo(meanRoll("passed") / 2, 6);
    expect(sign({ op: "stopMove" })).toBe(-1);
    expect(cost({ op: "push", delta: -3 })).toBe(3);
    expect(sign({ op: "push", delta: -3 })).toBe(-1);
    expect(sign({ op: "push", delta: 2 })).toBe(1);
    expect(cost({ op: "extend", delta: 2 })).toBe(2);
    expect(sign({ op: "extend", delta: 2 })).toBe(1);
    expect(cost({ op: "spinInstead", pool: "bonus" })).toBeCloseTo(PLAY_MODEL.spin.bonus, 6);
    expect(cost({ op: "spinInstead", pool: "penalty" })).toBeCloseTo(Math.abs(PLAY_MODEL.spin.penalty), 6);
    expect(sign({ op: "spinInstead", pool: "bonus" })).toBe(1);
    expect(sign({ op: "spinInstead", pool: "penalty" })).toBe(-1);
    // The board's, aimed at no one: whoever enters meets it.
    for (const a of [{ op: "placeObject" }, { op: "stopMove" }, { op: "push", delta: -2 }, { op: "extend", delta: 2 }, { op: "spinInstead", pool: "penalty" }] as ActionDoc[]) {
      expect(actionDef(a).harm(a, env)).toBe("none");
    }
  });

  it("reads in three languages", () => {
    expect(say({ op: "placeObject" })).toEqual({
      en: "the item stands on the chosen cell",
      ru: "предмет встаёт на выбранную клетку",
      uk: "предмет стає на обрану клітинку",
    });
    expect(say({ op: "stopMove" })).toEqual({
      en: "the move stops there without a landing",
      ru: "ход останавливается на ней без срабатывания клетки",
      uk: "хід зупиняється на ній без спрацювання клітинки",
    });
    expect(say({ op: "push", delta: -3 })).toEqual({
      en: "the player who entered is thrown 3 cells back",
      ru: "вошедшего игрока отбрасывает на 3 клетки назад",
      uk: "гравця, що увійшов, відкидає на 3 клітинки назад",
    });
    expect(say({ op: "push", delta: 1 }).en).toBe("the player who entered is moved 1 cell forward");
    expect(say({ op: "extend", delta: 2 })).toEqual({
      en: "the move goes 2 cells further",
      ru: "ход продолжается ещё на 2 клетки",
      uk: "хід триває ще на 2 клітинки",
    });
    expect(say({ op: "spinInstead", pool: "penalty" })).toEqual({
      en: "the penalty wheel spins instead of the cell",
      ru: "вместо клетки крутится штрафное колесо",
      uk: "замість клітинки крутиться штрафне колесо",
    });
  });

  it("refuses a push or a longer move without its cells, and a wheel without its pool", () => {
    const parse = (a: unknown) => isActionOp((a as { op: string }).op) && actionDef(a as ActionDoc).schema.safeParse(a).success;
    expect(parse({ op: "push" })).toBe(false);
    expect(parse({ op: "extend", delta: "far" })).toBe(false);
    expect(parse({ op: "spinInstead" })).toBe(false);
    expect(parse({ op: "spinInstead", pool: "event" })).toBe(false);
    expect(parse({ op: "stopMove", push: 2 })).toBe(false);
    expect(parse({ op: "placeObject", cell: 3 })).toBe(false);
    expect(parse({ op: "push", delta: { random: [-3, -1] } })).toBe(true);
  });
});

describe("wave D — the same cell (spec §6.19)", () => {
  const env = staticEnv();
  const arrived = ctx({ trigger: "onSameCell", turn: null });

  it("a rival arriving on the holder's cell is a moment of what lasts or is held; taking it, an item's", () => {
    expect(TRIGGERS.onSameCell).toMatchObject({ stage: "D", kinds: ["effect", "item"], hook: null, held: true });
    expect(TRIGGERS.onSameCell.knows).toEqual({ outcome: false, cell: false, dice: false });
    expect(ACTIONS.takeEntry).toMatchObject({ stage: "D", triggers: ["onSameCell"], itemsOnly: true });
    // The holder's entries may hand out, take away and pay out there too.
    for (const op of ["balance", "grantEffect", "grantItem", "cleanse", "remove", "transferItem"] as const) expect(ACTIONS[op].triggers).toContain("onSameCell");
  });

  it("the rival takes the item; points there are the executor's to write — no turn of the holder's runs", () => {
    expect(apply({ op: "takeEntry" }, arrived).take).toBe(true);
    expect(apply({ op: "takeEntry" }, arrived).intents).toEqual([]);
    expect(apply({ op: "balance", amount: 2 }, arrived).intents).toEqual([{ kind: "balance", to: "sp-me", delta: 2, reason: "effect:test_entry" }]);
  });

  it("taking is the board's: no harm, and worth nothing of its own — the item's tenure is (§14)", () => {
    expect(actionDef({ op: "takeEntry" }).harm({ op: "takeEntry" }, env)).toBe("none");
    expect(actionDef({ op: "takeEntry" }).cost({ op: "takeEntry" }, env, ANY_PLAY)).toBe(0);
  });

  it("reads in three languages", () => {
    expect(say({ op: "takeEntry" })).toEqual({
      en: "the rival who arrived takes this item",
      ru: "пришедший соперник забирает этот предмет",
      uk: "суперник, що прийшов, забирає цей предмет",
    });
    expect(ACTIONS.takeEntry.schema.safeParse({ op: "takeEntry", to: "self" }).success).toBe(false);
  });
});

