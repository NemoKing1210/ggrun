import { describe, expect, it } from "vitest";

import type { EntryDoc } from "./doc";
import { effectDoc, itemDoc, resolve } from "./fixtures.test-helpers";
import { entryPower } from "./power";

describe("entryPower — order, not magnitude", () => {
  it("more cells, more rolls and more charges never make an entry weaker", () => {
    const one = entryPower(effectDoc());
    const bigger = entryPower(effectDoc({ rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -3 }] }] }));
    const longer = entryPower(effectDoc({ duration: { unit: "rolls", count: 5 } }));
    expect(one).toBe(2);
    expect(bigger).toBeGreaterThan(one);
    expect(longer).toBeGreaterThan(one);
    const twice = entryPower(itemDoc({ usage: { activation: "active", charges: 2, target: { who: "other" } } }));
    expect(twice).toBe(entryPower(itemDoc()) * 2);
  });

  it("conditions scale a rule by how often they hold", () => {
    const always = entryPower(effectDoc({ rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 2 }] }] }));
    const sometimes = entryPower(
      effectDoc({ rules: [{ when: "afterMovement", if: [{ op: "chance", percent: 50 }], do: [{ op: "steps", delta: 2 }] }] }),
    );
    expect(sometimes).toBe(always / 2);
  });

  it("weighs passed games above rolls and permanence above both", () => {
    const rolls = entryPower(effectDoc({ duration: { unit: "rolls", count: 2 } }));
    const games = entryPower(effectDoc({ duration: { unit: "passed_games", count: 2 } }));
    const forever = entryPower(effectDoc({ duration: { unit: "permanent" } }));
    expect(games).toBeGreaterThan(rolls);
    expect(forever).toBeGreaterThan(games);
  });

  it("reads parameters at the value given and skips what does not parse", () => {
    const doc = effectDoc({
      params: { steps: { type: "int", default: -1, min: -6, max: -1 } },
      rules: [
        { when: "afterMovement", do: [{ op: "steps", delta: { param: "steps" } }, { op: "warp" }] },
        { when: "afterMovement", if: [{ op: "moon" }], do: [{ op: "steps", delta: -1 }] },
      ],
    });
    expect(entryPower(doc, { params: { steps: -4 }, resolve: (ref) => resolve(ref.entry) })).toBe(10);
    expect(entryPower(doc)).toBe(4);
  });

  it("nets a drawback against the gain: what the actions come to together, either way (spec §14)", () => {
    const steps = (gain: number, loss: number) =>
      entryPower(effectDoc({ rules: [{ when: "afterMovement", do: [{ op: "steps", delta: gain }, { op: "steps", delta: loss }] }] }));
    expect(steps(3, -1)).toBe(4);
    expect(steps(1, -3)).toBe(4);
    expect(steps(2, -2)).toBe(0);
    // «Кости судьбы»: a die more on a pass, no move on a low pass — less than the die alone.
    const onPass = { op: "outcome", is: "passed" } as const;
    const die = effectDoc({ rules: [{ when: "beforeMovement", if: [onPass], do: [{ op: "dice", count: 1 }] }] });
    const fate = effectDoc({
      rules: [
        ...die.rules,
        { when: "afterMovement", if: [onPass, { op: "diceShow", of: "sum", cmp: "lte", value: 4 }], do: [{ op: "noMove" }] },
      ],
    });
    // Two rolls of it: a die more on a pass (0.6 × 3.5) less a 2d6 sum of 4 or
    // less — the entry's own dice — lost (0.6 × 1/6 × 3⅓), not a 1d6 one.
    expect(entryPower(die)).toBe(4.2);
    expect(entryPower(fate)).toBe(3.5);
    // A penalty handed to the chosen player is the user's gain, to the holder a loss.
    const SWAMP = "d010558f-1f33-4da4-96b9-53e2596f8d16";
    const swamp = (to: "self" | "target") =>
      entryPower(
        itemDoc({
          usage: { activation: "active", charges: 1, target: { who: "other" } },
          rules: [
            { when: "onUse", do: [{ op: "move", by: 3 }, { op: "grantEffect", entry: { entry: SWAMP }, to }] },
          ],
        }),
        { resolve: () => ({ entryId: SWAMP, slug: "swamp", kind: "effect", character: "penalty", tags: [], name: { ru: "Болото" } }), powerOf: () => 2 },
      );
    expect(swamp("target")).toBe(5);
    expect(swamp("self")).toBe(1);
  });

  it("counts what an effect does on arrival and at its end once, however long it lasts", () => {
    const arrival = (duration: EntryDoc["duration"]) =>
      entryPower(effectDoc({ duration, rules: [{ when: "onApply", do: [{ op: "move", by: 3 }] }] }));
    expect(arrival({ unit: "instant" })).toBe(3);
    expect(arrival({ unit: "rolls", count: 4 })).toBe(3);
    expect(arrival({ unit: "triggers", count: 2 })).toBe(3);
    // A lasting rule beside it still counts per roll.
    const both = effectDoc({
      duration: { unit: "rolls", count: 2 },
      rules: [
        { when: "onApply", do: [{ op: "move", by: 3 }] },
        { when: "afterMovement", do: [{ op: "steps", delta: 1 }] },
      ],
    });
    expect(entryPower(both)).toBe(3 + 2);
    // A chance on arrival scales it even when the effect waits for its triggers.
    const maybe = effectDoc({
      duration: { unit: "triggers", count: 1 },
      rules: [{ when: "onApply", if: [{ op: "chance", percent: 50 }], do: [{ op: "move", by: 4 }] }],
    });
    expect(entryPower(maybe)).toBe(2);
  });

  it("an item that works while held: its charges, or for good; its pickup once (spec §6.10)", () => {
    const rules: EntryDoc["rules"] = [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }];
    const cursed = itemDoc({ character: "penalty", usage: { activation: "cursed", charges: 2 }, rules });
    const passive = itemDoc({ usage: { activation: "passive" }, rules });
    expect(entryPower(cursed)).toBe(2);
    // A passive item without charges works as long as a permanent effect.
    expect(entryPower(passive)).toBe(entryPower(effectDoc({ duration: { unit: "permanent" }, rules })));
    const pickup = itemDoc({ usage: { activation: "active", charges: 3 }, rules: [...itemDoc().rules, { when: "onPickup", do: [{ op: "move", by: 2 }] }] });
    expect(entryPower(pickup)).toBe(entryPower(itemDoc({ usage: { activation: "active", charges: 3 } })) + 2);
  });

  it("charges held wait for their conditions: each one is spent on a turn the rule fires (spec §6.10)", () => {
    const onPass: EntryDoc["rules"] = [{ when: "afterMovement", if: [{ op: "outcome", is: "passed" }], do: [{ op: "steps", delta: -1 }] }];
    const cursed = itemDoc({ character: "penalty", usage: { activation: "cursed", charges: 3 }, rules: onPass });
    // Like an effect that lasts three triggers — not three rolls, of which only some are passes.
    expect(entryPower(cursed)).toBe(entryPower(effectDoc({ character: "penalty", duration: { unit: "triggers", count: 3 }, rules: onPass })));
    expect(entryPower(cursed)).toBeGreaterThan(entryPower(effectDoc({ character: "penalty", duration: { unit: "rolls", count: 3 }, rules: onPass })));
    // A passive item without charges does not wait: it is there on every turn, firing when it may.
    const forGood = itemDoc({ usage: { activation: "passive" }, rules: onPass });
    expect(entryPower(forGood)).toBe(entryPower(effectDoc({ duration: { unit: "permanent" }, rules: onPass })));
  });
});

describe("entryPower — what arrives, and what holds (wave B, spec §6.13)", () => {
  const passive = (rules: EntryDoc["rules"], charges?: number) =>
    itemDoc({ usage: { activation: "passive", ...(charges ? { charges } : {}) }, rules });
  const harm = [{ op: "incoming", is: "harm" }];

  it("a protection that waits is worth what it stops, whenever that comes", () => {
    // «Щит», «Зеркальный щит», «Феникс» (wave B): what the pack's arrivals are worth (PLAY_MODEL.arrival).
    expect(entryPower(passive([{ when: "onIncoming", if: harm, do: [{ op: "block" }] }], 1))).toBe(1.9);
    expect(entryPower(passive([{ when: "onIncoming", if: harm, do: [{ op: "reflect" }] }], 1))).toBe(3.6);
    expect(entryPower(passive([{ when: "onIncoming", if: [{ op: "incoming", is: "moveBack" }], do: [{ op: "replace", with: 1 }] }], 1))).toBe(3.1);
    // Two charges, two answers.
    expect(entryPower(passive([{ when: "onIncoming", if: harm, do: [{ op: "block" }] }], 2))).toBe(3.8);
  });

  it("one that lasts is worth its answers as often as what it answers arrives", () => {
    const curse = effectDoc({
      character: "penalty",
      duration: { unit: "next_game" },
      rules: [{ when: "onIncoming", if: [{ op: "incoming", is: "entry", kind: "item", character: "bonus" }], do: [{ op: "block" }] }],
    });
    // A bonus item lands about once in sixteen rolls.
    expect(entryPower(curse)).toBe(0.1);
    // Without a condition it answers everything — the bonuses too, which it costs: since wave C
    // the penalty wheel is a quarter completion conditions, each worth little, so a block of
    // everything nets less than a block of harm alone.
    const anything = effectDoc({ duration: { unit: "rolls", count: 10 }, rules: [{ when: "onIncoming", do: [{ op: "block" }] }] });
    const harmOnly = effectDoc({ duration: { unit: "rolls", count: 10 }, rules: [{ when: "onIncoming", if: harm, do: [{ op: "block" }] }] });
    expect(entryPower(harmOnly)).toBe(0.3);
    expect(entryPower(anything)).toBe(0.1);
  });

  it("a standing state is worth its roll's share, times how long it lasts", () => {
    const veil = (count: number) =>
      effectDoc({ character: "bonus", duration: { unit: "rolls", count }, rules: [{ when: "whileActive", do: [{ op: "untargetable" }] }] });
    expect(entryPower(veil(10))).toBe(0.3);
    expect(entryPower(veil(20))).toBe(0.5);
    const chain = effectDoc({ character: "penalty", duration: { unit: "rolls", count: 10 }, rules: [{ when: "whileActive", do: [{ op: "forbidItems" }] }] });
    expect(entryPower(chain)).toBe(0.6);
  });
});

describe("entryPower — reaction items (wave B, spec §6.15)", () => {
  const reaction = (act: { op: string; [key: string]: unknown }, charges = 1) =>
    itemDoc({ usage: { activation: "active", window: "after_dice", charges }, rules: [{ when: "onUse", do: [act] }] } as Partial<EntryDoc>);
  const power = (doc: EntryDoc) => entryPower(doc);

  it("is worth what one use gains on the bad throw it is used on, times its charges", () => {
    expect(power(reaction({ op: "reroll" }))).toBe(2);
    expect(power(reaction({ op: "bestOfTwo" }))).toBe(2.2);
    expect(power(reaction({ op: "resultModify", delta: 1 }))).toBe(1);
    expect(power(reaction({ op: "resultModify", delta: 1 }, 2))).toBe(2);
  });

  it("a reaction waits for its throw: its conditions say where it is used, not how often", () => {
    const onOne = itemDoc({
      usage: { activation: "active", window: "after_dice", charges: 1 },
      rules: [{ when: "onUse", if: [{ op: "diceShow", of: "any", cmp: "eq", value: 1 }], do: [{ op: "rerollOn", values: [1] }] }],
    } as Partial<EntryDoc>);
    // A pass of 1 thrown again: 2.5 cells, whenever that comes.
    expect(power(onOne)).toBe(2.5);
  });
});

describe("entryPower — the next game (wave C, spec §6.16)", () => {
  const nextGame = (action: Record<string, unknown>, over: Partial<EntryDoc> = {}) =>
    entryPower(effectDoc({ duration: { unit: "next_game" }, rules: [{ when: "beforeGameRoll", do: [action as never] }], ...over }), { resolve: (ref) => resolve(ref.entry) });

  it("a pick for the next game is worth the chance it adds to pass it, once", () => {
    // «Выбор жанра»: +0.1 of 11.9 cells; «Выбор эпохи» +0.07; «Вето жанра» +0.03; «Любимчик» ×3 +0.02.
    expect(nextGame({ op: "poolRequire", genres: "picked" })).toBe(1.2);
    expect(nextGame({ op: "poolRequire", years: "picked" })).toBe(0.8);
    expect(nextGame({ op: "poolExclude", genres: "picked" })).toBe(0.4);
    expect(nextGame({ op: "poolFavor", factor: 3 })).toBe(0.2);
  });

  it("what the holder did not pick narrows their pool against them", () => {
    // «Испытание жанром» −0.04, «Старое железо» −0.05: setbacks, so the power is their size.
    expect(nextGame({ op: "poolExclude", genres: "lastPassed" })).toBe(0.5);
    expect(nextGame({ op: "poolRequire", years: { max: 2009 } })).toBe(0.6);
    // A pick and a drawback in one rule take from each other.
    expect(nextGame({ op: "poolRequire", genres: "picked", years: { max: 2009 } })).toBe(0.6);
  });

  it("a choice of games, and a game in flight replaced or set aside (spec §7.12)", () => {
    // «Второй шанс» +0.1, «Три двери» +0.15.
    expect(nextGame({ op: "chooseOfN", n: 2 })).toBe(1.2);
    expect(nextGame({ op: "chooseOfN", n: 3 })).toBe(1.8);
    const onOpenRoll = (action: Record<string, unknown>) =>
      entryPower(
        itemDoc({ usage: { activation: "active", window: "on_open_roll", target: { who: "self" }, charges: 1 }, rules: [{ when: "onUse", do: [action as never] }] }),
        { resolve: (ref) => resolve(ref.entry) },
      );
    // «Переролл игры» +0.2, «Отложенная игра» +0.15: rare by their mechanic.
    expect(onOpenRoll({ op: "rerollGame" })).toBe(2.4);
    expect(onOpenRoll({ op: "postponeGame" })).toBe(1.8);
  });

  it("a completion condition takes a twentieth of the game's worth; immunity keeps off what would come (spec §6.17)", () => {
    // «Сложный режим»: −0.05 of 11.9 cells on the next game.
    const hard = effectDoc({
      duration: { unit: "next_game" },
      tags: ["game_condition"],
      rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: { ru: "На высокой сложности" } }] }],
    });
    expect(entryPower(hard)).toBe(0.6);
    // Over five games, the conditions a game gets — 2.4 % of the time, read off `core`.
    const free = effectDoc({ character: "bonus", duration: { unit: "rolls", count: 5 }, rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] });
    expect(entryPower(free)).toBe(0.1);
    // «Иммунитет» waits for a game that gets conditions, and keeps one off a firing: what a condition takes.
    const once = effectDoc({ character: "bonus", duration: { unit: "triggers", count: 1 }, rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] });
    expect(entryPower(once)).toBe(entryPower(hard));
    const charm = itemDoc({ usage: { activation: "passive", charges: 2 }, rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] });
    expect(entryPower(charm)).toBe(1.2);
  });
});

describe("entryPower — objects on the board (wave D, spec §6.18)", () => {
  const object = (actions: Record<string, unknown>[], over: { charges?: number; if?: Record<string, unknown>[] } = {}) =>
    entryPower(
      itemDoc({
        usage: { activation: "active", window: "anytime", target: { who: "self" }, charges: over.charges ?? 1, pick: "cell" },
        rules: [
          { when: "onUse", do: [{ op: "placeObject" }] },
          { when: "onObjectEntered", ...(over.if ? { if: over.if as never } : {}), do: actions as never },
        ],
      }),
    );

  it("is worth what it does to the mover it was placed for, less what it does to the one it was not", () => {
    // Three in four meet the mover it was placed for (`PLAY_MODEL.object.aimed`): half of what it does, net.
    // A stop takes half a pass's move, 1.75 cells; a push back two more; a penalty wheel what it drops.
    expect(object([{ op: "stopMove" }, { op: "push", delta: -2 }])).toBe(1.9);
    expect(object([{ op: "stopMove" }, { op: "spinInstead", pool: "penalty" }])).toBe(1.4);
    expect(object([{ op: "extend", delta: 2 }])).toBe(1);
    // What it does nets out for the mover: a stop that then pushes forward is a quarter cell's worth.
    expect(object([{ op: "stopMove" }, { op: "push", delta: 2 }])).toBe(0.1);
  });

  it("each charge places it again; its conditions say how often it acts", () => {
    expect(object([{ op: "extend", delta: 2 }], { charges: 2 })).toBe(2);
    expect(object([{ op: "stopMove" }], { if: [{ op: "outcome", is: "dropped" }] })).toBeLessThan(object([{ op: "stopMove" }]));
  });

  it("placing alone does nothing", () => {
    expect(entryPower(itemDoc({ usage: { activation: "active", target: { who: "self" }, charges: 1, pick: "cell" }, rules: [{ when: "onUse", do: [{ op: "placeObject" }] }] }))).toBe(0);
  });
});

describe("entryPower — the same cell (wave D, spec §6.19)", () => {
  const passed: EntryDoc["rules"][number] = { when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: 1 }] };
  const crown = (rules: EntryDoc["rules"], charges?: number) =>
    entryPower(itemDoc({ rarity: "epic", usage: { activation: "passive", unique: "season", ...(charges ? { charges } : {}) }, rules }));

  it("an item a rival may take is worth what it does for as long as it stays: 1/sameCell rolls", () => {
    // «Корона»: +1 on a pass for ten rolls on average.
    expect(crown([passed, { when: "onSameCell", do: [{ op: "takeEntry" }] }])).toBe(6);
    // With charges, each spent on a pass it waits for: fewer than its tenure, they count.
    expect(crown([passed, { when: "onSameCell", do: [{ op: "takeEntry" }] }], 2)).toBe(2);
    // Without a rival to take it, a held item works for good.
    expect(crown([passed])).toBe(6);
  });

  it("a rule there fires as often as a rival arrives on the holder's cell", () => {
    const paid = effectDoc({ character: "bonus", duration: { unit: "rolls", count: 10 }, rules: [{ when: "onSameCell", do: [{ op: "balance", amount: 5 }] }] });
    const always = effectDoc({ character: "bonus", duration: { unit: "rolls", count: 10 }, rules: [{ when: "onOutcome", do: [{ op: "balance", amount: 5 }] }] });
    expect(entryPower(paid)).toBeCloseTo(entryPower(always) * 0.1, 1);
  });
});

