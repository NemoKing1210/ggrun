import { describe, expect, it } from "vitest";

import { IDS, effectDoc, itemDoc, resolve } from "./fixtures.test-helpers";
import { ruleSentence, ruleText } from "./text";

const refs = { params: {}, resolve };

describe("ruleText — whole entries", () => {
  it("an effect: what it does, then how long", () => {
    expect(ruleText(effectDoc(), refs)).toEqual({
      en: "Your move is 1 cell shorter. Lasts 2 rolls.",
      ru: "Ваш ход короче на 1 клетку. Действует 2 броска.",
      uk: "Ваш хід коротший на 1 клітинку. Діє 2 кидки.",
    });
  });

  it("an item: how it is used, then what it does", () => {
    expect(ruleText(itemDoc(), refs)).toEqual({
      en: "Use at any time on another player. Single use. The chosen player gets “Slowed”.",
      ru: "Применяется в любой момент на другого игрока. Одно использование. Выбранный игрок получает «Замедление».",
      uk: "Застосовується будь-коли на іншого гравця. Одне використання. Обраний гравець отримує «Уповільнення».",
    });
  });

  it("a self item used before the roll, with several charges", () => {
    const doc = itemDoc({
      usage: { activation: "active", window: "before_roll", target: { who: "self" }, charges: 3 },
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }] }],
    });
    expect(ruleText(doc, refs)).toEqual({
      en: "Use before your roll. 3 uses. You get “Tailwind”.",
      ru: "Применяется до броска. Использований: 3. Вы получаете «Попутный ветер».",
      uk: "Застосовується до кидка. Використань: 3. Ви отримуєте «Попутний вітер».",
    });
  });

  it("other windows and targets", () => {
    const openRoll = itemDoc({ usage: { activation: "active", window: "on_open_roll", target: { who: "any" }, charges: 1 } });
    expect(ruleText(openRoll, refs).en).toMatch(/^Use while your game is in progress on any player\./);
    expect(ruleText(openRoll, refs).ru).toMatch(/^Применяется, пока идёт ваша игра на любого игрока\./);
  });

  it("every duration unit has a sentence", () => {
    const cases = [
      [{ unit: "moves", count: 2 }, "Lasts 2 moves.", "Действует 2 хода.", "Діє 2 ходи."],
      [{ unit: "passed_games", count: 2 }, "Lasts until you pass 2 games.", "Действует, пока вы не пройдёте 2 игры.", "Діє, доки ви не пройдете 2 гри."],
      [{ unit: "triggers", count: 1 }, "Works once.", "Срабатывает 1 раз.", "Спрацьовує 1 раз."],
      [{ unit: "triggers", count: 3 }, "Works 3 times.", "Срабатывает 3 раза.", "Спрацьовує 3 рази."],
      [{ unit: "permanent" }, "Permanent.", "Действует постоянно.", "Діє постійно."],
      [
        { unit: "next_game" },
        "Lasts until your next game is resolved.",
        "Действует до конца вашей следующей игры.",
        "Діє до кінця вашої наступної гри.",
      ],
    ] as const;
    for (const [duration, en, ru, uk] of cases) {
      const t = ruleText(effectDoc({ duration: { ...duration } }), refs);
      expect(t.en.endsWith(en)).toBe(true);
      expect(t.ru.endsWith(ru)).toBe(true);
      expect(t.uk.endsWith(uk)).toBe(true);
    }
  });

  it("«Бремя» and «Магнит»'s effect read whole: a number from the game, the chosen player's roll (wave A)", () => {
    const burden = effectDoc({
      character: "penalty",
      duration: { unit: "next_game" },
      rules: [{ when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: { source: "itemCount", multiplier: -1 } }] }],
    });
    expect(ruleText(burden, refs).en).toBe(
      "If the game was passed, the dice result is lower by 1 for each item you hold (never below 1). Lasts until your next game is resolved.",
    );
    const pull = effectDoc({
      duration: { unit: "rolls", count: 1 },
      rules: [{ when: "afterMovement", if: [{ op: "compareLastRoll", mine: "next", cmp: "lt", theirs: "target" }], do: [{ op: "steps", delta: 2 }] }],
    });
    expect(ruleText(pull, refs).ru).toBe("Если ваш бросок меньше последнего броска выбранного игрока, ваш ход длиннее на 2 клетки. Действует 1 бросок.");
  });

  it("an instant effect says what it does, with no lead and no duration (spec §6.4)", () => {
    const doc = effectDoc({
      duration: { unit: "instant" },
      stacking: undefined,
      rules: [{ when: "onApply", do: [{ op: "move", by: { random: [-3, -1] } }] }],
    });
    expect(ruleText(doc, refs)).toEqual({
      en: "You instantly move 1–3 cells back.",
      ru: "Вы мгновенно перемещаетесь на 1–3 клетки назад.",
      uk: "Ви миттєво переміщуєтеся на 1–3 клітинки назад.",
    });
    // A lasting effect keeps its lead on arrival.
    const lasting = effectDoc({ rules: [{ when: "onApply", do: [{ op: "move", by: 2 }] }] });
    expect(ruleText(lasting, refs).en).toBe("When it is applied, you instantly move 2 cells forward. Lasts 2 rolls.");
  });

  it("an item that is never used says how it works, and when it is gone (spec §6.10)", () => {
    const cursed = itemDoc({
      character: "penalty",
      usage: { activation: "cursed", charges: 1 },
      rules: [{ when: "afterDice", do: [{ op: "resultModify", delta: -2 }] }],
    });
    expect(ruleText(cursed, refs)).toEqual({
      en: "Cursed: it cannot be used and works by itself. The dice result is 2 lower (never below 1). Works once, then it is gone.",
      ru: "Проклятый: его нельзя использовать, он действует сам. Результат кубиков на 2 меньше (не меньше 1). Срабатывает один раз и исчезает.",
      uk: "Проклятий: його не можна використати, він діє сам. Результат кубиків на 2 менший (не менше 1). Спрацьовує один раз і зникає.",
    });
    const passive = itemDoc({
      usage: { activation: "passive" },
      rules: [
        { when: "afterMovement", do: [{ op: "steps", delta: 1 }] },
        { when: "onPickup", do: [{ op: "balance", amount: 2 }] },
      ],
    });
    expect(ruleText(passive, refs).en).toBe("Works while you hold it. Your move is 1 cell longer. When you get it, you gain 2 points.");
    expect(ruleText(itemDoc({ usage: { activation: "passive", charges: 3 }, rules: passive.rules.slice(0, 1) }), refs).ru).toBe(
      "Действует, пока предмет у вас. Ваш ход длиннее на 1 клетку. Срабатывает 3 раза и исчезает.",
    );
  });

  it("a target filter names whom the item may be aimed at", () => {
    const magnet = itemDoc({ usage: { activation: "active", charges: 1, target: { who: "other", filter: "nearest_ahead" } } });
    expect(ruleText(magnet, refs).en).toMatch(/^Use at any time on the nearest player ahead of you\./);
    expect(ruleText(magnet, refs).ru).toMatch(/^Применяется в любой момент на ближайшего игрока впереди вас\./);
  });

  it("a removal agrees with its number in every language", () => {
    const remove = (op: Record<string, unknown>, who: "self" | "other" = "self") =>
      ruleText(itemDoc({ usage: { activation: "active", charges: 1, target: { who } }, rules: [{ when: "onUse", do: [{ op: "remove", ...op }] }] }), refs);
    expect(remove({ what: "any", character: "penalty", pick: "choice" })).toEqual({
      en: "Use at any time. Single use. Removes one of your penalty effects or cursed items of your choice.",
      ru: "Применяется в любой момент. Одно использование. Снимает на ваш выбор один ваш штрафной эффект или проклятый предмет.",
      uk: "Застосовується будь-коли. Одне використання. Знімає на ваш вибір один ваш штрафний ефект або проклятий предмет.",
    });
    const two = remove({ what: "item", character: "bonus", pick: "random", count: 2, from: "target" }, "other");
    expect(two.ru).toMatch(/Снимает 2 случайных бонусных предмета выбранного игрока\.$/);
    expect(two.uk).toMatch(/Знімає 2 випадкові бонусні предмети обраного гравця\.$/);
    expect(remove({ what: "item", character: "bonus", pick: "random", count: 5, from: "target" }, "other").ru).toMatch(
      /Снимает 5 случайных бонусных предметов выбранного игрока\.$/,
    );
    expect(remove({ what: "effect", pick: "newest" }).en).toMatch(/Removes your newest effect\.$/);
    expect(remove({ what: "effect", entry: { entry: IDS.slowed }, pick: "newest" }).ru).toMatch(/Снимает с вас «Замедление»\.$/);
  });

  it("prints a parameter at the value the season gave it", () => {
    const doc = effectDoc({
      params: { steps: { type: "int", default: -1, min: -6, max: -1 } },
      rules: [{ when: "afterMovement", do: [{ op: "steps", delta: { param: "steps" } }] }],
    });
    expect(ruleText(doc, { params: { steps: -3 }, resolve }).en).toBe("Your move is 3 cells shorter. Lasts 2 rolls.");
  });
});

describe("ruleSentence — leads and conditions", () => {
  const env = (locale: "en" | "ru" | "uk") => ({ locale, params: {}, decls: {}, resolve: (r: { entry: string }) => resolve(r.entry) });

  it("a landing rule absorbs its cell condition into the lead", () => {
    const rule = { when: "beforeCellEffect", if: [{ op: "cellType", in: ["penalty"] }], do: [{ op: "skipCellEffect" }] };
    expect(ruleSentence(rule, env("en"))).toBe("When you land on a penalty cell, the cell does not fire.");
    expect(ruleSentence(rule, env("ru"))).toBe("Когда вы встаёте на штрафную клетку, клетка не срабатывает.");
    expect(ruleSentence(rule, env("uk"))).toBe("Коли ви стаєте на штрафну клітинку, клітинка не спрацьовує.");
  });

  it("a landing rule without a cell condition speaks of any cell", () => {
    const rule = { when: "afterCellEffect", do: [{ op: "balance", amount: -1 }] };
    expect(ruleSentence(rule, env("en"))).toBe("When you land on a cell, you lose 1 point.");
    expect(ruleSentence(rule, env("ru"))).toBe("Когда вы встаёте на клетку, вы теряете 1 очко.");
    expect(ruleSentence(rule, env("uk"))).toBe("Коли ви стаєте на клітинку, ви втрачаєте 1 очко.");
  });

  it("an outcome rule absorbs pass or drop", () => {
    const passed = { when: "onOutcome", if: [{ op: "outcome", is: "passed" }], do: [{ op: "balance", amount: 1 }] };
    expect(ruleSentence(passed, env("en"))).toBe("When you pass a game, you gain 1 point.");
    expect(ruleSentence(passed, env("ru"))).toBe("Когда вы проходите игру, вы получаете 1 очко.");
    expect(ruleSentence(passed, env("uk"))).toBe("Коли ви проходите гру, ви отримуєте 1 очко.");
    const dropped = { ...passed, if: [{ op: "outcome", is: "dropped" }] };
    expect(ruleSentence(dropped, env("en"))).toBe("When you drop a game, you gain 1 point.");
    const either = { when: "onOutcome", if: [{ op: "cellType", in: ["bonus"] }], do: [{ op: "balance", amount: 2 }] };
    expect(ruleSentence(either, env("en"))).toBe(
      "When your game is resolved, if the move ended on a bonus cell, you gain 2 points.",
    );
    expect(ruleSentence(either, env("ru"))).toBe(
      "Когда ваша игра завершается, если ход закончился на бонусной клетке, вы получаете 2 очка.",
    );
  });

  it("effect lifecycle and end-of-turn leads", () => {
    expect(ruleSentence({ when: "onApply", do: [{ op: "balance", amount: 1 }] }, env("en"))).toBe(
      "When it is applied, you gain 1 point.",
    );
    expect(ruleSentence({ when: "onExpire", do: [{ op: "cleanse", count: "all" }] }, env("ru"))).toBe(
      "Когда эффект заканчивается, снимает все ваши эффекты.",
    );
    expect(ruleSentence({ when: "onTick", do: [{ op: "balance", amount: -1 }] }, env("uk"))).toBe(
      "Наприкінці вашого ходу ви втрачаєте 1 очко.",
    );
    expect(ruleSentence({ when: "onApply", do: [{ op: "balance", amount: 1 }] }, env("ru"))).toBe(
      "При наложении вы получаете 1 очко.",
    );
    expect(
      ruleSentence(
        { when: "onTick", if: [{ op: "outcome", is: "passed" }, { op: "chance", percent: 20 }], do: [{ op: "balance", amount: 1 }] },
        env("ru"),
      ),
    ).toBe("В конце вашего хода, если игра пройдена, с вероятностью 20% вы получаете 1 очко.");
  });

  it("conditions join under one 'if'; a chance stands on its own", () => {
    const rule = {
      when: "afterMovement",
      if: [
        { op: "outcome", is: "passed" },
        { op: "hasEntry", who: "self", tag: "dice" },
        { op: "chance", percent: 50 },
      ],
      do: [{ op: "steps", delta: 1 }, { op: "balance", amount: 1 }],
    };
    expect(ruleSentence(rule, env("en"))).toBe(
      "If the game was passed and you have an item or effect tagged “dice”, with a 50% chance, your move is 1 cell longer and you gain 1 point.",
    );
    const chanceOnly = { when: "afterMovement", if: [{ op: "chance", percent: 30 }], do: [{ op: "steps", delta: 2 }] };
    expect(ruleSentence(chanceOnly, env("en"))).toBe("With a 30% chance, your move is 2 cells longer.");
    expect(ruleSentence(chanceOnly, env("ru"))).toBe("С вероятностью 30% ваш ход длиннее на 2 клетки.");
    expect(ruleSentence(chanceOnly, env("uk"))).toBe("З імовірністю 30% ваш хід довший на 2 клітинки.");
  });
});

describe("ruleText — what arrives, and what holds (wave B, spec §6.13)", () => {
  it("an answer's rule leads with what arrives; without a condition, with anything at all", () => {
    const shield = itemDoc({
      usage: { activation: "passive", charges: 1 },
      rules: [{ when: "onIncoming", if: [{ op: "incoming", is: "harm" }], do: [{ op: "block" }] }],
    });
    expect(ruleText(shield, refs)).toEqual({
      en: "Works while you hold it. When a rival aims a harmful action at you, it is cancelled. Works once, then it is gone.",
      ru: "Действует, пока предмет у вас. Когда соперник направляет на вас вредное действие, это отменяется. Срабатывает один раз и исчезает.",
      uk: "Діє, поки предмет у вас. Коли суперник спрямовує на вас шкідливу дію, це скасовується. Спрацьовує один раз і зникає.",
    });
    const all = effectDoc({ rules: [{ when: "onIncoming", if: [{ op: "chance", percent: 50 }], do: [{ op: "block" }] }] });
    expect(ruleText(all, refs).en).toBe("When anything acts on you, with a 50% chance, it is cancelled. Lasts 2 rolls.");
    expect(ruleText(all, refs).ru).toBe("Когда на вас что-либо действует, с вероятностью 50% это отменяется. Действует 2 броска.");
  });

  it("a standing state needs no lead: the duration or the usage says how long", () => {
    const chain = effectDoc({ character: "penalty", duration: { unit: "rolls", count: 1 }, rules: [{ when: "whileActive", do: [{ op: "forbidItems" }] }] });
    expect(ruleText(chain, refs)).toEqual({
      en: "You cannot use items. Lasts 1 roll.",
      ru: "Вы не можете использовать предметы. Действует 1 бросок.",
      uk: "Ви не можете використовувати предмети. Діє 1 кидок.",
    });
  });
});

describe("ruleText — the player's choices (wave B, spec §6.14)", () => {
  it("«Налог»: a choice as it arrives, a cell back with nothing to give", () => {
    const tax = effectDoc({
      character: "penalty",
      duration: { unit: "instant" },
      stacking: undefined,
      rules: [
        { when: "onApply", if: [{ op: "itemCount", cmp: "gte", value: 1, character: "bonus" }], do: [{ op: "victimChoice" }] },
        { when: "onApply", if: [{ op: "itemCount", cmp: "eq", value: 0, character: "bonus" }], do: [{ op: "move", by: -1 }] },
      ],
    });
    const text = ruleText(tax, refs);
    expect(text.en).toMatch(/^If you hold .*bonus item.*, you discard a bonus item of your choice\. If you hold .*, you instantly move 1 cell back\.$/);
    expect(text.ru).toContain("вы сбрасываете бонусный предмет на ваш выбор");
    expect(text.uk).toContain("ви скидаєте бонусний предмет на ваш вибір");
  });

  it("«Перегруз» and «Проклятие жадности» read as what they ask and how long", () => {
    const overload = effectDoc({
      character: "penalty",
      duration: { unit: "rolls", count: 1 },
      rules: [
        { when: "onApply", do: [{ op: "victimChoice", count: 2, orKeep: true }] },
        { when: "afterDice", do: [{ op: "resultModify", cap: 3 }] },
      ],
    });
    expect(ruleText(overload, refs).en).toMatch(/^When it is applied, you may discard 2 bonus items of your choice to be rid of it\. .*3.* Lasts 1 roll\.$/);
    const greed = effectDoc({ character: "penalty", duration: { unit: "next_game" }, rules: [{ when: "whileActive", do: [{ op: "holdLimit", max: 1 }] }] });
    expect(ruleText(greed, refs)).toEqual({
      en: "You may hold at most 1 bonus item: when you hold more, you choose which one to keep and the rest burn. Lasts until your next game is resolved.",
      ru: "У вас может быть не больше 1 бонусного предмета: когда их больше, вы выбираете, какой оставить, а остальные сгорают. Действует до конца вашей следующей игры.",
      uk: "У вас може бути не більше 1 бонусного предмета: коли їх більше, ви обираєте, який залишити, а решта згорає. Діє до кінця вашої наступної гри.",
    });
  });
});

describe("ruleText — the next game (wave C, spec §6.16)", () => {
  it("an item that asks for a pick says what is picked as it is used", () => {
    const veto = itemDoc({
      usage: { activation: "active", target: { who: "self" }, charges: 1, pick: "genre" },
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: IDS.tailwind }, to: "self" }] }],
    });
    expect(ruleText(veto, refs)).toEqual({
      en: "Use at any time, picking a genre. Single use. You get “Tailwind”.",
      ru: "Применяется в любой момент, с выбором жанра. Одно использование. Вы получаете «Попутный ветер».",
      uk: "Застосовується будь-коли, з вибором жанру. Одне використання. Ви отримуєте «Попутний вітер».",
    });
    const era = itemDoc({ ...veto, usage: { activation: "active", window: "before_roll", target: { who: "self" }, charges: 1, pick: "years" } });
    expect(ruleText(era, refs).en).toMatch(/^Use before your roll, picking a span of release years\. /);
    const fav = itemDoc({ ...veto, usage: { activation: "active", target: { who: "self" }, charges: 1, pick: "game" } });
    expect(ruleText(fav, refs).ru).toMatch(/^Применяется в любой момент, с выбором игры\. /);
  });

  it("a rule at beforeGameRoll opens with the pick of a game", () => {
    const veto = effectDoc({
      character: "bonus",
      duration: { unit: "next_game" },
      rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "picked" }] }],
    });
    expect(ruleText(veto, refs)).toEqual({
      en: "When a game is picked for you, games of the genre you picked cannot come up. Lasts until your next game is resolved.",
      ru: "Когда вам выбирается игра, не выпадают игры выбранного вами жанра. Действует до конца вашей следующей игры.",
      uk: "Коли вам обирається гра, не випадають ігри обраного вами жанру. Діє до кінця вашої наступної гри.",
    });
    const trial = effectDoc({
      duration: { unit: "next_game" },
      rules: [{ when: "beforeGameRoll", if: [{ op: "chance", percent: 50 }], do: [{ op: "poolExclude", genres: "lastPassed" }] }],
    });
    expect(ruleText(trial, refs).en).toBe(
      "When a game is picked for you, with a 50% chance, games sharing a genre with the last game you passed cannot come up. Lasts until your next game is resolved.",
    );
  });

  it("a choice of games, and an item that acts on the game in progress", () => {
    const doors = effectDoc({ character: "bonus", duration: { unit: "next_game" }, rules: [{ when: "beforeGameRoll", do: [{ op: "chooseOfN", n: 3 }] }] });
    expect(ruleText(doors, refs)).toEqual({
      en: "When a game is picked for you, the draw offers 3 games and you take one. Lasts until your next game is resolved.",
      ru: "Когда вам выбирается игра, выпадают 3 игры на выбор — вы берёте одну. Действует до конца вашей следующей игры.",
      uk: "Коли вам обирається гра, випадають 3 гри на вибір — ви берете одну. Діє до кінця вашої наступної гри.",
    });
    const reroll = itemDoc({
      usage: { activation: "active", window: "on_open_roll", target: { who: "self" }, charges: 1 },
      rules: [{ when: "onUse", do: [{ op: "rerollGame" }] }],
    });
    expect(ruleText(reroll, refs).en).toBe(
      "Use while your game is in progress. Single use. Your game in progress is replaced by a new one, without a judge and without spending the season's rerolls.",
    );
    const later = itemDoc({ ...reroll, rules: [{ when: "onUse", do: [{ op: "postponeGame" }] }] });
    expect(ruleText(later, refs).ru).toBe(
      "Применяется, пока идёт ваша игра. Одно использование. Ваша текущая игра откладывается и вернётся к вам через 2 броска; сейчас выбирается новая игра.",
    );
  });

  it("a completion condition on the game assigned, and immunity to them (spec §6.17)", () => {
    const hard = effectDoc({
      duration: { unit: "next_game" },
      tags: ["game_condition"],
      rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: { ru: "Пройти на высокой сложности", en: "Beat it on hard" } }] }],
    });
    expect(ruleText(hard, refs)).toEqual({
      en: "When you get a game, the game gets a completion condition: “Beat it on hard”. Lasts until your next game is resolved.",
      ru: "Когда вы получаете игру, игре добавляется условие прохождения: «Пройти на высокой сложности». Действует до конца вашей следующей игры.",
      uk: "Коли ви отримуєте гру, грі додається умова проходження: «Пройти на высокой сложности». Діє до кінця вашої наступної гри.",
    });
    const free = effectDoc({ character: "bonus", duration: { unit: "rolls", count: 3 }, rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] });
    expect(ruleText(free, refs).en).toBe("Your games get no completion conditions. Lasts 3 rolls.");
  });
});

describe("ruleText — objects on the board (wave D, spec §6.18)", () => {
  const usage = { activation: "active", window: "anytime", target: { who: "self" }, charges: 1, pick: "cell" } as const;
  const placed = { when: "onUse", do: [{ op: "placeObject" }] };

  it("an item that stands on the board: its use picks the cell, its rules meet whoever enters", () => {
    const mine = itemDoc({ usage, rules: [placed, { when: "onObjectEntered", do: [{ op: "stopMove" }, { op: "push", delta: -2 }] }] });
    expect(ruleText(mine, refs)).toEqual({
      en: "Use at any time, picking a cell. Single use. The item stands on the chosen cell. When a move passes through or ends on its cell, the move stops there without a landing and the player who entered is thrown 2 cells back.",
      ru: "Применяется в любой момент, с выбором клетки. Одно использование. Предмет встаёт на выбранную клетку. Когда чей-то ход проходит через его клетку или заканчивается на ней, ход останавливается на ней без срабатывания клетки и вошедшего игрока отбрасывает на 2 клетки назад.",
      uk: "Застосовується будь-коли, з вибором клітинки. Одне використання. Предмет стає на обрану клітинку. Коли чийсь хід проходить через його клітинку або закінчується на ній, хід зупиняється на ній без спрацювання клітинки і гравця, що увійшов, відкидає на 2 клітинки назад.",
    });
    const spring = itemDoc({ usage, rules: [placed, { when: "onObjectEntered", do: [{ op: "extend", delta: 3 }] }] });
    expect(ruleText(spring, refs).en).toBe(
      "Use at any time, picking a cell. Single use. The item stands on the chosen cell. When a move passes through or ends on its cell, the move goes 3 cells further.",
    );
    const pit = itemDoc({
      usage,
      rules: [placed, { when: "onObjectEntered", if: [{ op: "outcome", is: "dropped" }], do: [{ op: "stopMove" }, { op: "spinInstead", pool: "penalty" }] }],
    });
    expect(ruleText(pit, refs).ru).toBe(
      "Применяется в любой момент, с выбором клетки. Одно использование. Предмет встаёт на выбранную клетку. Когда чей-то ход проходит через его клетку или заканчивается на ней, если игра дропнута, ход останавливается на ней без срабатывания клетки и вместо клетки крутится штрафное колесо.",
    );
  });
});

describe("ruleText — the same cell (wave D, spec §6.19)", () => {
  it("«Корона»: what it does while held, who takes it, and that there is one", () => {
    const crown = itemDoc({
      usage: { activation: "passive", unique: "season" },
      rules: [
        { when: "afterDice", if: [{ op: "outcome", is: "passed" }], do: [{ op: "resultModify", delta: 1 }] },
        { when: "onSameCell", do: [{ op: "takeEntry" }] },
      ],
    });
    expect(ruleText(crown, refs)).toEqual({
      en: "Works while you hold it. If the game was passed, the dice result is 1 higher. When a rival's move ends on your cell, the rival who arrived takes this item. There is one in the season.",
      ru: "Действует, пока предмет у вас. Если игра пройдена, результат кубиков на 1 больше. Когда ход соперника заканчивается на вашей клетке, пришедший соперник забирает этот предмет. В сезоне такой предмет один.",
      uk: "Діє, поки предмет у вас. Якщо гру пройдено, результат кубиків на 1 більший. Коли хід суперника закінчується на вашій клітинці, суперник, що прийшов, забирає цей предмет. У сезоні такий предмет один.",
    });
  });
});

describe("rule text — reaction items (wave B, spec §6.15)", () => {
  const reaction = (rules: NonNullable<Parameters<typeof itemDoc>[0]>["rules"]) =>
    itemDoc({ usage: { activation: "active", window: "after_dice", charges: 1 }, rules });

  it("opens with when it is used, then what it does to the dice", () => {
    const coin = ruleText(reaction([{ when: "onUse", do: [{ op: "reroll" }] }]), refs);
    expect(coin.en).toBe("Use right after the dice. Single use. The dice are thrown again and the new throw stands.");
    expect(coin.ru).toBe("Применяется сразу после броска. Одно использование. Кубики перебрасываются, засчитывается новый бросок.");
    expect(coin.uk).toBe("Застосовується одразу після кидка. Одне використання. Кубики перекидаються, зараховується новий кидок.");
    expect(ruleText(reaction([{ when: "onUse", do: [{ op: "resultModify", delta: 1 }] }]), refs).en).toBe(
      "Use right after the dice. Single use. The dice result is 1 higher.",
    );
  });
});
